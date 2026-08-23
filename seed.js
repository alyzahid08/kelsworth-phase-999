require("dotenv").config();
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { query, pool } = require("./db");

const DEMO_PRODUCTS = [
  {
    slug: "vw-101",
    name: "Slim Tapered Jeans — Raw Indigo",
    category: "jeans",
    fit: "slim",
    color: "Indigo",
    price: 6490,
    salePrice: null,
    sizes: ["28x30", "28x32", "30x30", "30x32", "32x30", "32x32", "34x32", "34x34"],
    sizeType: "waist_length",
    image: "/images/slim-tapered-jeans-indigo.svg",
    badge: "New",
    description:
      "A slim leg that tapers to the ankle without choking your stride. Cut from 12oz raw indigo denim that breaks in exactly where you bend.",
    fabric: "98% cotton, 2% elastane · 12oz denim",
    care: "Wash cold, inside out. Line dry. Avoid tumble drying to protect the wash.",
    material: "Cotton-Elastane Denim",
    stretch: "low",
    collection: "New Arrivals",
    tags: ["raw denim", "new arrival", "slim fit"],
    completeTheLook: ["vw-107", "vw-112"],
    frequentlyBoughtWith: ["vw-111"],
  },
  {
    slug: "vw-102",
    name: "Straight Fit Jeans — Stonewash",
    category: "jeans",
    fit: "straight",
    color: "Stonewash",
    price: 5990,
    salePrice: 4790,
    sizes: ["30", "32", "34", "36", "38"],
    image: "/images/straight-fit-jeans-stonewash.svg",
    badge: "Sale",
    description:
      "The straight leg that goes with everything. Stonewashed for a broken-in feel from the first wear, with a mid-rise waist that sits clean under a tucked shirt.",
    fabric: "100% cotton denim · 11.5oz",
    care: "Machine wash cold on gentle cycle. Do not bleach.",
    material: "100% Cotton Denim",
    stretch: "none",
    collection: "Core",
  },
  {
    slug: "vw-103",
    name: "Regular Fit Jeans — Jet Black",
    category: "jeans",
    fit: "regular",
    color: "Black",
    price: 5990,
    salePrice: null,
    sizes: ["28", "30", "32", "34", "36", "38"],
    image: "/images/regular-fit-jeans-black.svg",
    badge: null,
    description:
      "Overdyed jet black denim in a true regular fit — room through the thigh, straight through the leg. Holds its colour wash after wash.",
    fabric: "99% cotton, 1% elastane · 13oz denim",
    care: "Wash separately for first 3 washes. Cold wash, inside out.",
    material: "Cotton-Elastane Denim",
    stretch: "low",
    collection: "Core",
  },
  {
    slug: "vw-104",
    name: "Relaxed Fit Jeans — Mid Blue",
    category: "jeans",
    fit: "relaxed",
    color: "Mid Blue",
    price: 6290,
    salePrice: null,
    sizes: ["30", "32", "34", "36"],
    image: "/images/relaxed-fit-jeans-midblue.svg",
    badge: null,
    description:
      "Extra room through the seat and thigh for a fit that moves with you. A mid-blue wash with just enough contrast on the whiskering.",
    fabric: "100% cotton denim · 12.5oz",
    care: "Wash cold, inside out. Tumble dry low if needed.",
    material: "100% Cotton Denim",
    stretch: "none",
    collection: "Core",
  },
  {
    slug: "vw-105",
    name: "Distressed Slim Jeans — Washed Grey",
    category: "jeans",
    fit: "slim",
    color: "Washed Grey",
    price: 6990,
    salePrice: 5590,
    sizes: ["28", "30", "32", "34"],
    image: "/images/distressed-slim-jeans-washed.svg",
    badge: "Sale",
    description:
      "Hand-distressed at the knee and hem, garment-washed for a lived-in grey. Each pair carries a slightly different fade — no two are identical.",
    fabric: "97% cotton, 3% elastane · 11oz denim",
    care: "Cold hand wash recommended to preserve distressing.",
    material: "Cotton-Elastane Denim",
    stretch: "low",
    collection: "Limited Edition",
  },
  {
    slug: "vw-106",
    name: "Skinny Jeans — Charcoal",
    category: "jeans",
    fit: "skinny",
    color: "Charcoal",
    price: 5790,
    salePrice: null,
    sizes: ["28", "30", "32", "34"],
    image: "/images/skinny-jeans-charcoal.svg",
    badge: null,
    description:
      "The narrowest cut in the line, built with four-way stretch so it moves without giving up the shape. Charcoal wash reads black from a distance.",
    fabric: "95% cotton, 5% elastane · 10.5oz denim",
    care: "Wash cold, inside out. Do not iron directly on prints.",
    material: "Stretch Cotton Denim",
    stretch: "high",
    collection: "Core",
  },
  {
    slug: "vw-107",
    name: "Denim Trucker Jacket — Indigo",
    category: "jackets",
    fit: "regular",
    color: "Indigo",
    price: 8990,
    salePrice: null,
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "/images/denim-trucker-jacket-indigo.svg",
    badge: "New",
    description:
      "The trucker jacket, done properly: chest pockets that actually hold something, a boxy body, and raw indigo that will fade to your own wear pattern.",
    fabric: "100% cotton denim · 13.5oz",
    care: "Wash cold, inside out. Line dry to keep its shape.",
    material: "100% Cotton Denim",
    stretch: "none",
    collection: "New Arrivals",
    tags: ["trucker jacket", "new arrival", "layering piece"],
    styleCode: "kw-trucker-jacket",
  },
  {
    slug: "vw-108",
    name: "Denim Jacket — Jet Black",
    category: "jackets",
    fit: "regular",
    color: "Black",
    price: 8990,
    salePrice: 7190,
    sizes: ["S", "M", "L", "XL"],
    image: "/images/denim-jacket-black.svg",
    badge: "Sale",
    description:
      "Same trucker silhouette in overdyed black. Layers over a hoodie without fighting for space through the shoulders.",
    fabric: "99% cotton, 1% elastane · 13oz denim",
    care: "Wash separately, cold, inside out.",
    material: "Cotton-Elastane Denim",
    stretch: "low",
    collection: "Sale",
    tags: ["trucker jacket", "sale", "layering piece"],
    styleCode: "kw-trucker-jacket",
  },
  {
    slug: "vw-109",
    name: "Denim Shorts — Stonewash",
    category: "shorts",
    fit: "regular",
    color: "Stonewash",
    price: 3990,
    salePrice: null,
    sizes: ["28", "30", "32", "34", "36"],
    image: "/images/denim-shorts-stonewash.svg",
    badge: null,
    description:
      "A knee-length cut off the straight jean block, stonewashed and finished with a raw hem. Built for the months you don't want denim on your ankles.",
    fabric: "100% cotton denim · 11oz",
    care: "Machine wash cold. Do not bleach.",
    material: "100% Cotton Denim",
    stretch: "none",
    collection: "Core",
  },
  {
    slug: "vw-110",
    name: "Denim Shorts — Mid Blue",
    category: "shorts",
    fit: "slim",
    color: "Mid Blue",
    price: 3990,
    salePrice: 3190,
    sizes: ["28", "30", "32", "34"],
    image: "/images/denim-shorts-midblue.svg",
    badge: "Sale",
    description:
      "A slightly slimmer cut through the thigh, mid-blue wash, finished hem. The one you reach for on the hottest day of the week.",
    fabric: "98% cotton, 2% elastane · 10.5oz denim",
    care: "Wash cold, inside out.",
    material: "Cotton-Elastane Denim",
    stretch: "low",
    collection: "Sale",
  },
  {
    slug: "vw-111",
    name: "Colourblock Polo — Forest Green",
    category: "polos",
    fit: "regular",
    color: "Forest Green",
    price: 3490,
    salePrice: null,
    sizes: ["S", "M", "L", "XL"],
    image: "/images/polo-shirt-forest.svg",
    badge: "New",
    description:
      "A clean-collar polo in breathable cotton pique with a colourblocked chest panel. Holds its shape wash after wash.",
    fabric: "100% cotton pique",
    care: "Machine wash cold. Do not bleach. Iron on low.",
    material: "Cotton Pique",
    stretch: "none",
    collection: "New Arrivals",
  },
  {
    slug: "vw-112",
    name: "Oversized Tee — Charcoal",
    category: "tees",
    fit: "relaxed",
    color: "Charcoal",
    price: 2490,
    salePrice: 1990,
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "/images/oversized-tee-charcoal.svg",
    badge: "Sale",
    description:
      "A heavyweight cotton tee with a boxy, oversized drop-shoulder cut. An everyday staple that layers clean under a jacket.",
    fabric: "100% cotton · 220gsm",
    care: "Wash cold, inside out. Tumble dry low.",
    material: "100% Cotton",
    stretch: "none",
    collection: "Sale",
  },
  {
    slug: "vw-113",
    name: "Drop Shoulder Tee — Charcoal",
    category: "drop-shoulder-shirts",
    fit: "regular",
    color: "Charcoal",
    price: 3290,
    salePrice: null,
    sizes: ["S", "M", "L", "XL"],
    image: "/images/drop-shoulder-tee-charcoal.jpg",
    badge: null,
    description:
      "A relaxed, boxy drop-shoulder tee in a soft cotton blend, cut for an easy oversized fit. Works on or off duty.",
    fabric: "97% cotton, 3% elastane",
    care: "Machine wash cold. Iron on low.",
    material: "Cotton-Elastane Blend",
    stretch: "low",
    collection: "Core",
  },
  {
    slug: "vw-114",
    name: "Full Sleeve Casual Shirt — Stone",
    category: "full-sleeve-shirts",
    fit: "regular",
    color: "Stone",
    price: 3690,
    salePrice: null,
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "/images/full-sleeve-casual-shirt-stone.svg",
    badge: null,
    description:
      "A long-sleeve casual shirt in a stone cotton twill. Dress it up tucked in, or wear it open over a plain tee.",
    fabric: "100% cotton twill",
    care: "Machine wash cold. Iron on medium.",
    material: "100% Cotton Twill",
    stretch: "none",
    collection: "Core",
  },
  {
    slug: "vw-115",
    name: "Leather Bifold Wallet — Tan",
    category: "wallets",
    fit: "regular",
    color: "Tan",
    price: 2490,
    salePrice: null,
    sizes: ["One Size"],
    image: "/images/leather-bifold-wallet-tan.svg",
    badge: "New",
    description:
      "Full-grain leather bifold with 6 card slots, 2 hidden pockets and a bill compartment. Slim enough for a front-pocket carry but holds everything you need.",
    fabric: "Full-grain cowhide leather",
    care: "Wipe with a dry cloth. Apply leather conditioner every 3-4 months.",
    material: "Full-Grain Leather",
    stretch: "none",
    collection: "Accessories",
    tags: ["wallet", "leather", "new arrival", "accessories"],
  },
  {
    slug: "vw-116",
    name: "Leather Card Holder — Black",
    category: "wallets",
    fit: "regular",
    color: "Black",
    price: 1790,
    salePrice: null,
    sizes: ["One Size"],
    image: "/images/leather-card-holder-black.svg",
    badge: null,
    description:
      "A minimal card holder in matte black leather — 4 card slots and a centre cash strap. For the guy who travels light.",
    fabric: "Top-grain leather",
    care: "Wipe with a damp cloth. Avoid direct sunlight for extended periods.",
    material: "Top-Grain Leather",
    stretch: "none",
    collection: "Core",
    tags: ["wallet", "leather", "accessories", "minimal"],
  },
  {
    slug: "vw-117",
    name: "Canvas Trifold Wallet — Olive",
    category: "wallets",
    fit: "regular",
    color: "Olive",
    price: 1290,
    salePrice: 990,
    image: "/images/canvas-trifold-wallet-olive.svg",
    badge: "Sale",
    description:
      "Waxed canvas exterior with a leather trim. Trifold design with zip coin pocket, 8 card slots and an ID window. Built for everyday abuse.",
    fabric: "Waxed canvas + leather trim",
    care: "Spot clean. Re-wax canvas once a year for water resistance.",
    material: "Waxed Canvas",
    stretch: "none",
    collection: "Sale",
    tags: ["wallet", "canvas", "sale", "accessories"],
  },
  {
    slug: "vw-118",
    name: "Chrono Watch — Stainless Steel",
    category: "watches",
    fit: "regular",
    color: "Silver",
    price: 6990,
    salePrice: null,
    sizes: ["One Size"],
    image: "/images/chrono-watch-steel.svg",
    badge: "New",
    description:
      "A 42mm chronograph with a brushed stainless steel case, Japanese quartz movement and a genuine leather strap. Water resistant to 50m.",
    fabric: "Stainless steel case, genuine leather strap",
    care: "Avoid contact with perfume or chemicals. Wipe with a soft cloth after exposure to water.",
    material: "Stainless Steel + Leather",
    stretch: "none",
    collection: "Accessories",
    tags: ["watch", "chronograph", "new arrival", "accessories"],
  },
  {
    slug: "vw-119",
    name: "Minimal Watch — Rose Gold",
    category: "watches",
    fit: "regular",
    color: "Rose Gold",
    price: 5490,
    salePrice: null,
    sizes: ["One Size"],
    image: "/images/minimal-watch-rosegold.svg",
    badge: null,
    description:
      "A clean 38mm dial with rose gold case and mesh band. Japanese movement, sapphire-coated crystal. Dress it up or down.",
    fabric: "Alloy case, stainless steel mesh band",
    care: "Keep away from magnets. Clean with a microfiber cloth.",
    material: "Alloy + Stainless Steel Mesh",
    stretch: "none",
    collection: "Core",
    tags: ["watch", "minimal", "accessories"],
  },
  {
    slug: "vw-120",
    name: "Sport Digital Watch — Black",
    category: "watches",
    fit: "regular",
    color: "Black",
    price: 3990,
    salePrice: 3190,
    image: "/images/sport-digital-watch-black.svg",
    badge: "Sale",
    description:
    "A rugged digital watch with LED backlight, stopwatch, alarm, and 100m water resistance. Resin strap for all-day comfort.",
    fabric: "Resin case, silicone strap",
    care: "Rinse with fresh water after saltwater exposure. Do not press buttons underwater.",
    material: "Resin + Silicone",
    stretch: "none",
    collection: "Sale",
    tags: ["watch", "digital", "sport", "sale", "accessories"],
  },
  {
    slug: "vw-121",
    name: "Baseball Cap — Washed Black",
    category: "caps",
    fit: "regular",
    color: "Black",
    price: 1490,
    salePrice: null,
    sizes: ["One Size"],
    image: "/images/baseball-cap-black.svg",
    badge: "New",
    description:
      "A washed cotton twill cap with a pre-curved brim and adjustable back strap. Unstructured crown sits naturally without that stiff look.",
    fabric: "100% washed cotton twill",
    care: "Hand wash cold. Reshape and air dry.",
    material: "Washed Cotton",
    stretch: "none",
    collection: "Accessories",
    tags: ["cap", "baseball", "new arrival", "accessories"],
  },
  {
    slug: "vw-122",
    name: "Dad Cap — Stone",
    category: "caps",
    fit: "regular",
    color: "Stone",
    price: 1490,
    salePrice: null,
    sizes: ["One Size"],
    image: "/images/dad-cap-stone.svg",
    badge: null,
    description:
      "An unstructured dad cap in a muted stone wash. Low profile, embroidered Kelsworth logo at the front. Your everyday grab-and-go.",
    fabric: "100% cotton canvas",
    care: "Hand wash cold. Air dry flat.",
    material: "Cotton Canvas",
    stretch: "none",
    collection: "Core",
    tags: ["cap", "dad cap", "accessories"],
  },
  {
    slug: "vw-123",
    name: "Snapback Cap — Indigo",
    category: "caps",
    fit: "regular",
    color: "Indigo",
    price: 1690,
    salePrice: null,
    sizes: ["One Size"],
    image: "/images/snapback-cap-indigo.svg",
    badge: null,
    description:
      "A structured snapback in raw indigo denim with a flat brim. Woven label patch on the front. Pairs naturally with the denim range.",
    fabric: "Raw indigo denim",
    care: "Spot clean. Avoid machine washing to preserve the shape.",
    material: "Raw Denim",
    stretch: "none",
    collection: "Core",
    tags: ["cap", "snapback", "denim", "accessories"],
  },
  {
    slug: "vw-124",
    name: "Leather Bracelet — Brown",
    category: "bracelets",
    fit: "regular",
    color: "Brown",
    price: 990,
    salePrice: null,
    sizes: ["One Size"],
    image: "/images/leather-bracelet-brown.svg",
    badge: "New",
    description:
      "A braided leather bracelet with a magnetic stainless steel clasp. Subtle, masculine, and built to age beautifully alongside your jeans.",
    fabric: "Genuine leather, stainless steel clasp",
    care: "Avoid prolonged water exposure. Apply a drop of leather oil monthly.",
    material: "Genuine Leather + Stainless Steel",
    stretch: "none",
    collection: "Accessories",
    tags: ["bracelet", "leather", "new arrival", "accessories"],
  },
  {
    slug: "vw-125",
    name: "Beaded Bracelet — Onyx",
    category: "bracelets",
    fit: "regular",
    color: "Black",
    price: 790,
    salePrice: null,
    sizes: ["One Size"],
    image: "/images/beaded-bracelet-onyx.svg",
    badge: null,
    description:
      "8mm matte onyx beads on a durable elastic cord. Stack it with a watch or wear it solo for a clean, minimal look.",
    fabric: "Matte onyx stone, elastic cord",
    care: "Remove before showering or swimming. Wipe with a soft cloth.",
    material: "Onyx Stone",
    stretch: "none",
    collection: "Core",
    tags: ["bracelet", "beads", "onyx", "accessories"],
  },
  {
    slug: "vw-126",
    name: "Paracord Bracelet — Olive",
    category: "bracelets",
    fit: "regular",
    color: "Olive",
    price: 690,
    salePrice: null,
    sizes: ["One Size"],
    image: "/images/paracord-bracelet-olive.svg",
    badge: null,
    description:
      "Military-grade 550 paracord woven into a cobra knot. Stainless steel shackle clasp. Looks tough, is tough.",
    fabric: "550 paracord, stainless steel shackle",
    care: "Hand wash with mild soap. Air dry completely.",
    material: "550 Paracord + Stainless Steel",
    stretch: "none",
    collection: "Core",
    tags: ["bracelet", "paracord", "military", "accessories"],
  },
];

async function main() {
  console.log("Creating tables (if they don't already exist)...");
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await query(schema);

  const { rows: existing } = await query("SELECT COUNT(*)::int AS count FROM products");
  if (existing[0].count === 0) {
    console.log("Seeding demo products...");
    const slugToId = {};
    for (const p of DEMO_PRODUCTS) {
      // Give each size a modest starter stock count so the new stock
      // tracking/enforcement has real numbers to work with immediately.
      const stockBySize = {};
      p.sizes.forEach((size) => { stockBySize[size] = 15; });
      const totalStock = p.sizes.length * 15;
      const skuBySize = {};
      p.sizes.forEach((size) => { skuBySize[size] = `${p.slug.toUpperCase()}-${size}`; });

      const { rows } = await query(
        `INSERT INTO products
          (slug, name, category, fit, color, price, sale_price, sizes, image, badge, description, fabric, care, stock, stock_by_size,
           tags, sku, sku_by_size, style_code, size_type, complete_the_look, frequently_bought_with, material, stretch, collection)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
         RETURNING id`,
        [
          p.slug, p.name, p.category, p.fit, p.color, p.price, p.salePrice,
          JSON.stringify(p.sizes), p.image, p.badge, p.description, p.fabric, p.care,
          totalStock, JSON.stringify(stockBySize),
          JSON.stringify(p.tags || []), p.slug.toUpperCase(), JSON.stringify(skuBySize),
          p.styleCode || null, p.sizeType || "standard",
          JSON.stringify(p.completeTheLook || []), JSON.stringify(p.frequentlyBoughtWith || []),
          p.material || null, p.stretch || "none", p.collection || null,
        ]
      );
      slugToId[p.slug] = rows[0].id;
    }
    console.log(`Inserted ${DEMO_PRODUCTS.length} products (15 units per size).`);

    console.log("Seeding a few sample reviews...");
    const sampleReviews = [
      { slug: "vw-101", name: "Ahmed K.", rating: 5, title: "Fits exactly as expected", body: "Ordered my usual waist and length and it fit true to size. The denim is thick without feeling stiff.", verified: true },
      { slug: "vw-101", name: "Bilal S.", rating: 4, title: "Great jeans, runs slightly long", body: "Good quality raw denim, held up well after a few washes. I'd size down on length if you're under 5'9\".", verified: true },
      { slug: "vw-107", name: "Hamza R.", rating: 5, title: "Exactly the trucker jacket I wanted", body: "Boxy fit, solid stitching, and the indigo is going to fade nicely with wear.", verified: false },
    ];
    for (const r of sampleReviews) {
      const productId = slugToId[r.slug];
      if (!productId) continue;
      await query(
        `INSERT INTO product_reviews (product_id, customer_name, rating, title, body, verified_purchase)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [productId, r.name, r.rating, r.title, r.body, r.verified]
      );
    }
  } else {
    console.log("Products table already has data — skipping product seed.");

    // For a store that was already live before per-size stock existed,
    // backfill a starter stock count so nothing is stuck showing
    // "unlimited" forever. Only touches products with no per-size stock
    // set yet — safe to re-run, never overwrites stock you've already set.
    const { rows: unstocked } = await query(
      "SELECT id, sizes FROM products WHERE stock_by_size = '{}'::jsonb"
    );
    if (unstocked.length) {
      console.log(`Backfilling starter stock for ${unstocked.length} existing product(s)...`);
      for (const p of unstocked) {
        const stockBySize = {};
        (p.sizes || []).forEach((size) => { stockBySize[size] = 15; });
        const totalStock = (p.sizes || []).length * 15;
        await query("UPDATE products SET stock_by_size = $1, stock = $2 WHERE id = $3", [
          JSON.stringify(stockBySize), totalStock, p.id,
        ]);
      }
      console.log("Backfill done — adjust exact numbers any time in the admin Products page.");
    }
  }

  const { rows: admins } = await query("SELECT COUNT(*)::int AS count FROM admin_users");
  if (admins[0].count === 0) {
    const username = process.env.ADMIN_INITIAL_USERNAME || "admin";
    const password = process.env.ADMIN_INITIAL_PASSWORD || "ChangeMe123!";
    const hash = await bcrypt.hash(password, 10);
    await query("INSERT INTO admin_users (username, password_hash, role) VALUES ($1,$2,$3)", [username, hash, "super_admin"]);
    console.log(`Created admin login → username: "${username}", password: "${password}"`);
    console.log("Log in at /admin/login.html and change this password as soon as you can.");
  } else {
    console.log("An admin user already exists — skipping admin seed.");
  }

  await pool.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
