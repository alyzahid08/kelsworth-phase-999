const express = require("express");
const path = require("path");

const router = express.Router();

// Load the Pakistani addresses data once at startup
let addressData = null;
function getAddresses() {
  if (!addressData) {
    try {
      addressData = require(path.join(__dirname, "..", "data", "pakistan-addresses.json"));
    } catch (err) {
      console.error("[addresses] Could not load pakistan-addresses.json:", err.message);
      addressData = { cities: [] };
    }
  }
  return addressData;
}

// GET /api/addresses?city=Karachi&area=DHA
// Fuzzy search across cities and areas. Returns matching results.
router.get("/", (req, res) => {
  const { q, city } = req.query;
  const data = getAddresses();

  // If a specific city is requested, return its areas
  if (city) {
    const cityLower = city.toLowerCase().trim();
    const found = data.cities.find((c) => c.name.toLowerCase() === cityLower);
    if (found) {
      let areas = found.areas;
      // Filter areas if search query also provided
      if (q) {
        const qLower = q.toLowerCase().trim();
        areas = areas.filter((a) => a.toLowerCase().includes(qLower));
      }
      return res.json({
        city: found.name,
        province: found.province,
        areas,
      });
    }
    return res.json({ cities: [], areas: [] });
  }

  // If just a search query, search across city names and areas
  if (q) {
    const qLower = q.toLowerCase().trim();
    const results = [];

    for (const c of data.cities) {
      // Match on city name
      if (c.name.toLowerCase().includes(qLower)) {
        results.push({
          type: "city",
          city: c.name,
          province: c.province,
          areaCount: c.areas.length,
        });
        continue;
      }

      // Match on area names within a city
      const matchingAreas = c.areas.filter((a) => a.toLowerCase().includes(qLower));
      if (matchingAreas.length) {
        results.push({
          type: "area",
          city: c.name,
          province: c.province,
          areas: matchingAreas.slice(0, 8),
        });
      }
    }

    // Limit results for autocomplete UX
    return res.json({ results: results.slice(0, 10) });
  }

  // No query — return list of all cities for a dropdown
  res.json({
    cities: data.cities.map((c) => ({ name: c.name, province: c.province, areaCount: c.areas.length })),
  });
});

// GET /api/addresses/cities — just city names (lightweight)
router.get("/cities", (req, res) => {
  const data = getAddresses();
  res.set("Cache-Control", "public, max-age=86400");
  res.json(
    data.cities.map((c) => ({ name: c.name, province: c.province }))
  );
});

module.exports = router;
