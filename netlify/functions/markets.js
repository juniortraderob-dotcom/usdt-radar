
const EXCHANGES = [
  {
    id: "binance",
    name: "Binance",
    url: "https://api.binance.com/api/v3/depth?symbol=USDTBRL&limit=50",
    parse: d => ({ asks: d.asks, bids: d.bids })
  },
  {
    id: "bitso",
    name: "Bitso",
    url: "https://api.bitso.com/v3/order_book/?book=usdt_brl",
    parse: d => ({ asks: d.payload?.asks, bids: d.payload?.bids })
  },
  {
    id: "mercadobitcoin",
    name: "Mercado Bitcoin",
    url: "https://api.mercadobitcoin.net/api/v4/tickers?symbols=USDT-BRL",
    parse: d => {
      const t = Array.isArray(d) ? d[0] : (d?.[0] || d);
      const ask = Number(t?.ask || t?.sell || t?.ask_price);
      const bid = Number(t?.bid || t?.buy || t?.bid_price);
      return {
        asks: ask > 0 ? [[String(ask), "1000000"]] : [],
        bids: bid > 0 ? [[String(bid), "1000000"]] : [],
        tickerOnly: true
      };
    }
  },
  {
    id: "novadax",
    name: "NovaDAX",
    url: "https://api.novadax.com/v1/market/depth?symbol=USDT_BRL&limit=50",
    parse: d => ({ asks: d?.data?.asks, bids: d?.data?.bids })
  },
  {
    id: "foxbit",
    name: "Foxbit",
    url: "https://api.foxbit.com.br/rest/v3/markets/usdtbrl/orderbook",
    parse: d => {
      const x = d?.data || d?.result || d;
      return {
        asks: x?.asks || x?.sell || x?.ask,
        bids: x?.bids || x?.buy || x?.bid
      };
    }
  },
  {
    id: "bitget",
    name: "Bitget",
    url: "https://api.bitget.com/api/v2/spot/market/orderbook?symbol=USDTBRL&type=step0&limit=50",
    parse: d => {
      if (d?.code && d.code !== "00000") {
        throw new Error(d.msg || ("API code " + d.code));
      }
      return { asks: d?.data?.asks, bids: d?.data?.bids };
    }
  }
];

function normalize(levels, descending = false) {
  if (!Array.isArray(levels)) return [];
  return levels
    .map(x => [Number(x?.[0]), Number(x?.[1])])
    .filter(([p, q]) =>
      Number.isFinite(p) && Number.isFinite(q) && p > 0 && q > 0
    )
    .sort((a, b) => descending ? b[0] - a[0] : a[0] - b[0]);
}

exports.handler = async function () {
  const markets = [];
  const errors = [];

  await Promise.all(EXCHANGES.map(async ex => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(ex.url, {
        headers: { accept: "application/json" },
        signal: controller.signal
      });

      if (!response.ok) throw new Error("HTTP " + response.status);

      const data = await response.json();
      const parsed = ex.parse(data);
      const asks = normalize(parsed.asks);
      const bids = normalize(parsed.bids, true);

      if (!asks.length || !bids.length) {
        throw new Error("Livro vazio ou par indisponível");
      }

      markets.push({
        id: ex.id,
        name: ex.name,
        asks,
        bids,
        tickerOnly: Boolean(parsed.tickerOnly)
      });
    } catch (e) {
      const msg = e?.name === "AbortError"
        ? "Tempo limite da API"
        : String(e?.message || e);
      errors.push(ex.name + ": " + msg.slice(0, 180));
    } finally {
      clearTimeout(timer);
    }
  }));

  markets.sort((a, b) =>
    EXCHANGES.findIndex(x => x.id === a.id) -
    EXCHANGES.findIndex(x => x.id === b.id)
  );

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify({
      symbol: "USDT/BRL",
      markets,
      errors,
      timestamp: new Date().toISOString()
    })
  };
};
