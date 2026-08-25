require("dotenv").config();
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { query, pool } = require("./db");

const DEMO_PRODUCTS = [
  {
    slug: "vw-101",
    name: "Premium Cotton Unstitched — Sky Blue",
    category: "cotton",
    fit: "2-piece",
    color: "Sky Blue",
    price: 2490,
    salePrice: null,
    sizes: ["2 Piece", "3 Piece"],
    image: "/images/premium-cotton-unstitched-sky-blue.svg",
    badge: "New",
    description:
      "A crisp, breathable cotton unstitched suit length in sky blue. Combed cotton weave that holds its shape through the tailor and through the season.",
    fabric: "100% combed cotton",
    care: "Hand wash or machine wash cold before stitching. Iron on medium heat.",
    material: "100% Cotton",
    stretch: "none",
    collection: "New Arrivals",
    tags: ["unstitched", "cotton", "new arrival"],
    completeTheLook: ["vw-108", "vw-113"],
    frequentlyBoughtWith: ["vw-112"],
  },
  {
    slug: "vw-102",
    name: "Cotton Unstitched — Stone Grey",
    category: "cotton",
    fit: "2-piece",
    color: "Stone Grey",
    price: 2290,
    salePrice: 1890,
    sizes: ["2 Piece", "3 Piece"],
    image: "/images/cotton-unstitched-stone-grey.svg",
    badge: "Sale",
    description:
      "An everyday cotton suit length in a versatile stone grey. Lightweight enough for daily wear, dense enough to hold a proper crease.",
    fabric: "100% cotton",
    care: "Machine wash cold before stitching. Do not bleach.",
    material: "100% Cotton",
    stretch: "none",
    collection: "Core",
  },
  {
    slug: "vw-103",
    name: "Cotton Unstitched — Jet Black",
    category: "cotton",
    fit: "2-piece",
    color: "Jet Black",
    price: 2390,
    salePrice: null,
    sizes: ["2 Piece", "3 Piece"],
    image: "/images/cotton-unstitched-jet-black.svg",
    badge: null,
    description:
      "A deep, colorfast black cotton unstitched suit length. Stitches up clean for formal or semi-formal wear without going sheer.",
    fabric: "100% cotton",
    care: "Hand wash separately in cold water for the first few washes to lock in color.",
    material: "100% Cotton",
    stretch: "none",
    collection: "Core",
  },
  {
    slug: "vw-104",
    name: "Cotton Unstitched — Olive Check",
    category: "cotton",
    fit: "3-piece",
    color: "Olive Check",
    price: 2590,
    salePrice: null,
    sizes: ["2 Piece", "3 Piece"],
    image: "/images/cotton-unstitched-olive-check.svg",
    badge: null,
    description:
      "A subtle self-check woven into an olive cotton base. Comes as a full 3-piece length with matching waistcoat fabric included.",
    fabric: "100% cotton",
    care: "Machine wash cold before stitching. Iron on medium heat.",
    material: "100% Cotton",
    stretch: "none",
    collection: "Core",
  },
  {
    slug: "vw-105",
    name: "Wash & Wear Unstitched — Charcoal",
    category: "wash-n-wear",
    fit: "2-piece",
    color: "Charcoal",
    price: 3190,
    salePrice: 2590,
    sizes: ["2 Piece", "3 Piece"],
    image: "/images/wash-n-wear-unstitched-charcoal.svg",
    badge: "Sale",
    description:
      "Wrinkle-resistant wash & wear fabric that goes straight from the wash to the wardrobe with barely a crease. Charcoal that works for office or evening.",
    fabric: "65% polyester, 35% cotton wash & wear blend",
    care: "Machine washable. Minimal ironing needed — that's the point.",
    material: "Poly-Cotton Wash & Wear",
    stretch: "none",
    collection: "Core",
  },
  {
    slug: "vw-106",
    name: "Wash & Wear Unstitched — Steel Blue",
    category: "wash-n-wear",
    fit: "2-piece",
    color: "Steel Blue",
    price: 3290,
    salePrice: null,
    sizes: ["2 Piece", "3 Piece"],
    image: "/images/wash-n-wear-unstitched-steel-blue.svg",
    badge: "New",
    description:
      "A low-maintenance steel blue wash & wear length built for the person who wants to look sharp without the ironing board.",
    fabric: "65% polyester, 35% cotton wash & wear blend",
    care: "Machine washable. Tumble dry low, minimal ironing needed.",
    material: "Poly-Cotton Wash & Wear",
    stretch: "none",
    collection: "New Arrivals",
  },
  {
    slug: "vw-107",
    name: "Wash & Wear Unstitched — Ivory",
    category: "wash-n-wear",
    fit: "3-piece",
    color: "Ivory",
    price: 2990,
    salePrice: null,
    sizes: ["2 Piece", "3 Piece"],
    image: "/images/wash-n-wear-unstitched-ivory.svg",
    badge: null,
    description:
      "A clean ivory wash & wear length that holds its finish through repeated washing — a dependable choice for Friday prayers or formal occasions.",
    fabric: "65% polyester, 35% cotton wash & wear blend",
    care: "Machine washable. Wash separately for the first wash.",
    material: "Poly-Cotton Wash & Wear",
    stretch: "none",
    collection: "Core",
  },
  {
    slug: "vw-108",
    name: "Karandi Unstitched — Rust Brown",
    category: "karandi",
    fit: "3-piece",
    color: "Rust Brown",
    price: 3990,
    salePrice: null,
    sizes: ["2 Piece", "3 Piece"],
    image: "/images/karandi-unstitched-rust-brown.svg",
    badge: "New",
    description:
      "A warm, brushed karandi suit length built for the cold months. Rust brown with enough weight to hold up on its own without a jacket.",
    fabric: "Brushed karandi wool-viscose blend",
    care: "Dry clean recommended. Store folded, away from direct sunlight.",
    material: "Karandi Blend",
    stretch: "none",
    collection: "Winter",
    tags: ["karandi", "winter", "new arrival"],
  },
  {
    slug: "vw-109",
    name: "Karandi Unstitched — Bottle Green",
    category: "karandi",
    fit: "3-piece",
    color: "Bottle Green",
    price: 3790,
    salePrice: 3190,
    sizes: ["2 Piece", "3 Piece"],
    image: "/images/karandi-unstitched-bottle-green.svg",
    badge: "Sale",
    description:
      "A deep bottle green karandi length with a soft brushed hand-feel — one of our warmest fabrics, built for the peak of winter.",
    fabric: "Brushed karandi wool-viscose blend",
    care: "Dry clean recommended.",
    material: "Karandi Blend",
    stretch: "none",
    collection: "Winter",
  },
  {
    slug: "vw-110",
    name: "Khaddar Unstitched — Mustard",
    category: "khaddar",
    fit: "2-piece",
    color: "Mustard",
    price: 3490,
    salePrice: null,
    sizes: ["2 Piece", "3 Piece"],
    image: "/images/khaddar-unstitched-mustard.svg",
    badge: null,
    description:
      "A handwoven-look khaddar length in mustard, with the coarse, breathable texture khaddar is known for. Warm without feeling heavy.",
    fabric: "100% pure khaddar cotton",
    care: "Hand wash cold. Dry flat in shade.",
    material: "Pure Khaddar",
    stretch: "none",
    collection: "Winter",
  },
  {
    slug: "vw-111",
    name: "Khaddar Unstitched — Charcoal Melange",
    category: "khaddar",
    fit: "2-piece",
    color: "Charcoal Melange",
    price: 3690,
    salePrice: null,
    sizes: ["2 Piece", "3 Piece"],
    image: "/images/khaddar-unstitched-charcoal-melange.svg",
    badge: null,
    description:
      "A flecked charcoal melange khaddar length — textured, warm, and built for daily winter wear rather than one season on the shelf.",
    fabric: "100% pure khaddar cotton",
    care: "Hand wash cold. Dry flat in shade.",
    material: "Pure Khaddar",
    stretch: "none",
    collection: "Winter",
  },
  {
    slug: "vw-112",
    name: "Linen Unstitched — Sand Beige",
    category: "linen",
    fit: "2-piece",
    color: "Sand Beige",
    price: 4290,
    salePrice: null,
    sizes: ["2 Piece", "3 Piece"],
    image: "/images/linen-unstitched-sand-beige.svg",
    badge: "New",
    description:
      "A premium sand beige linen length — breathable, light, and built for the hottest months without clinging or creasing excessively.",
    fabric: "100% pure linen",
    care: "Dry clean recommended for the crispest finish. Iron warm while slightly damp.",
    material: "100% Linen",
    stretch: "none",
    collection: "New Arrivals",
  },
  {
    slug: "vw-113",
    name: "Linen Unstitched — Off White",
    category: "linen",
    fit: "3-piece",
    color: "Off White",
    price: 3990,
    salePrice: null,
    sizes: ["2 Piece", "3 Piece"],
    image: "/images/linen-unstitched-off-white.svg",
    badge: null,
    description:
      "A classic off-white linen length, cool against the skin and finished to drape rather than stiffen. Comes as a full 3-piece cut.",
    fabric: "100% pure linen",
    care: "Dry clean recommended. Iron warm while slightly damp.",
    material: "100% Linen",
    stretch: "none",
    collection: "Core",
  },
  {
    slug: "vw-114",
    name: "Blended Unstitched — Ash Grey",
    category: "blended",
    fit: "2-piece",
    color: "Ash Grey",
    price: 2190,
    salePrice: 1790,
    sizes: ["2 Piece", "3 Piece"],
    image: "/images/blended-unstitched-ash-grey.svg",
    badge: "Sale",
    description:
      "An everyday ash grey blended fabric length — a practical, easy-care option for those who want something dependable without the premium price tag.",
    fabric: "Cotton-polyester blend",
    care: "Machine wash cold. Tumble dry low.",
    material: "Cotton-Poly Blend",
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
    sizes: ["One Size"],
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
    sizes: ["One Size"],
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
      "A structured snapback in raw indigo denim with a flat brim. Woven label patch on the front. A durable everyday cap that pairs well with any outfit.",
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
      "A braided leather bracelet with a magnetic stainless steel clasp. Subtle, masculine, and built to age beautifully with everyday wear.",
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
      { slug: "vw-101", name: "Ahmed K.", rating: 5, title: "Fits exactly as expected", body: "Ordered the 3-piece and the fabric was true to what's shown — good weight, easy for my tailor to work with.", verified: true },
      { slug: "vw-101", name: "Bilal S.", rating: 4, title: "Great fabric, colour slightly lighter in person", body: "Good quality cotton, held up well after a few washes. Slightly lighter blue than the photo but still nice.", verified: true },
      { slug: "vw-107", name: "Hamza R.", rating: 5, title: "Exactly the wash & wear I wanted", body: "Barely needed an iron after the wash, and the ivory hasn't yellowed after repeated washing.", verified: false },
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
