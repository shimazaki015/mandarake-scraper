import fetch from "node-fetch";
import * as cheerio from "cheerio";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  try {
    const listUrl = req.query.url;
    if (!listUrl) return res.status(400).send("URL required");

    const base = "https://ekizo.mandarake.co.jp";

    // 一覧取得
    const html = await fetch(listUrl).then(r => r.text());
    const $ = cheerio.load(html);

    const links = [];

    $("a[href*='itemInfoJa.html']").each((i, el) => {
  let href = $(el).attr("href");

  if (!href) return;

  // 正しいパスだけ許可
  if (!href.includes("/auction/item/")) return;

  // URL補完
  if (href.startsWith("http")) {
    links.push(href);
  } else {
    links.push(base + href);
  }
});

    const uniqueLinks = [...new Set(links)];

    const results = [];

    for (const link of uniqueLinks) {
      await sleep(1000); // 安全ディレイ

      const detailHtml = await fetch(link).then(r => r.text());
      const $$ = cheerio.load(detailHtml);

      const text = $$.root().text();

      const getText = (label) => {
        const el = $$(`th:contains("${label}")`).next("td");
        return el.text().trim();
      };

      // パンくず
      const breadcrumbText = $$(".topic-path").text();
      const breadcrumbArr = breadcrumbText.split(">").map(t => t.trim());
      const category = breadcrumbArr[breadcrumbArr.length - 2] || "";

      // コメント
      const comment = getText("コメント");

      // オークション番号（z133）
      const auctionMatch = comment.match(/z\d{3}/);
      const auctionNo = auctionMatch ? auctionMatch[0] : "";

      // 商品コード
      const codeMatch = text.match(/商品コード[:：]\s*(\d+)/);
      const productCode = codeMatch ? codeMatch[1] : "";

      // 保証書
      const guarantee = text.includes("保証書あり") ? "あり" : "";

      // セルNO
      const cellNo = getText("セルNo") || getText("セルNO");

      results.push({
        url: link,
        auctionNo,
        itemName: $$("h1").text().trim(),
        category,
        guarantee,
        startPrice: getText("開始価格"),
        bids: getText("入札件数"),
        watch: getText("ウォッチ件数"),
        startDate: getText("開始日時"),
        itemNumber: getText("商品番号"),
        auctionType: getText("オークション形式"),
        bidUnit: getText("入札単位"),
        productName: getText("商品名"),
        size: getText("サイズ"),
        note: getText("備考"),
        character: getText("キャラ"),
        condition: getText("状態"),
        conditionDetail: getText("状態詳細"),
        cellNo,
        comment,
        productCode
      });
    }

    // 商品名でソート（日本語）
    results.sort((a, b) =>
      a.itemName.localeCompare(b.itemName, "ja")
    );

    // CSV変換
    const header = [
      "URL","オークション番号","アイテム名","カテゴリー","保証書",
      "開始価格","入札件数","ウォッチ件数","開始日時","商品番号",
      "オークション形式","入札単位","商品名","サイズ","備考",
      "キャラ","状態","状態詳細","セルNO","コメント","商品コード"
    ];

    const rows = results.map(r => [
      r.url, r.auctionNo, r.itemName, r.category, r.guarantee,
      r.startPrice, r.bids, r.watch, r.startDate, r.itemNumber,
      r.auctionType, r.bidUnit, r.productName, r.size, r.note,
      r.character, r.condition, r.conditionDetail, r.cellNo,
      r.comment, r.productCode
    ]);

    const csv = [
      header.join(","),
      ...rows.map(row => row.map(v => `"${(v||"").replace(/"/g,'""')}"`).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.send(csv);

  } catch (e) {
    res.status(500).send(e.toString());
  }
}
