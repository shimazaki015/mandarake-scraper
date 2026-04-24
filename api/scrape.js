import fetch from "node-fetch";
import * as cheerio from "cheerio";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  try {
    const listUrl = req.query.url;
    if (!listUrl) return res.status(400).send("URL required");

    const base = "https://ekizo.mandarake.co.jp";

    const html = await fetch(listUrl).then(r => r.text());
    const $ = cheerio.load(html);

    const links = [];

    $("a[href*='itemInfoJa.html']").each((i, el) => {
      let href = $(el).attr("href");
      if (!href) return;
      if (!href.includes("/auction/item/")) return;

      if (href.startsWith("http")) {
        links.push(href);
      } else {
        links.push(base + href);
      }
    });

    const uniqueLinks = [...new Set(links)];

    const results = [];

    for (const link of uniqueLinks) {
      await sleep(1000);

      const detailHtml = await fetch(link).then(r => r.text());
      const $$ = cheerio.load(detailHtml);

      const bodyText = $$.root().text();

      const pick = (label) => {
        const regex = new RegExp(label + "[^\\n]*");
        const match = bodyText.match(regex);
        if (!match) return "";
        return match[0]
          .replace(label, "")
          .replace("：", "")
          .replace(":", "")
          .trim();
      };

      const comment = pick("コメント");

      const auctionMatch = comment.match(/z\d{3}/);
      const auctionNo = auctionMatch ? auctionMatch[0] : "";

      const codeMatch = bodyText.match(/商品コード[:：]\s*(\d+)/);
      const productCode = codeMatch ? codeMatch[1] : "";

      const guarantee = bodyText.includes("保証書あり") ? "あり" : "";

      const breadcrumbText = $$(".topic-path").text();
      const breadcrumbArr = breadcrumbText.split(">").map(t => t.trim());
      const category = breadcrumbArr[breadcrumbArr.length - 2] || "";

      results.push({
        url: link,
        auctionNo,
        itemName: $$("title").text().trim(),
        category,
        guarantee,
        startPrice: pick("開始価格"),
        bids: pick("入札件数"),
        watch: pick("ウォッチ件数"),
        startDate: pick("開始日時"),
        itemNumber: pick("商品番号"),
        auctionType: pick("オークション形式"),
        bidUnit: pick("入札単位"),
        productName: pick("商品名"),
        size: pick("サイズ"),
        note: pick("備考"),
        character: pick("キャラ"),
        condition: pick("状態"),
        conditionDetail: pick("状態詳細"),
        cellNo: pick("セル"),
        comment,
        productCode
      });
    }

    results.sort((a, b) =>
      a.itemName.localeCompare(b.itemName, "ja")
    );

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
