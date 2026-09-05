const db = require("../../config/db");

const HERO_SLIDER_COLUMNS = [
  "id",
  "tag",
  "title",
  "highlight",
  "subtitle",
  "cta",
  "href",
  "secondary_cta",
  "secondary_href",
  "image",
  "display_order",
  "is_active",
  "created_at",
  "updated_at",
];

function findActiveSliders() {
  return db("hero_sliders")
    .select(HERO_SLIDER_COLUMNS)
    .where({ is_active: true })
    .orderBy("display_order", "asc")
    .orderBy("created_at", "desc");
}

function findSliders({
  page = 1,
  limit = 20,
  offset = 0,
  search,
  isActive,
  sortBy = "display_order",
  sortOrder = "asc",
} = {}) {
  let query = db("hero_sliders").select(HERO_SLIDER_COLUMNS);

  if (isActive !== undefined && isActive !== "" && isActive !== "all") {
    const activeBool = isActive === true || isActive === "true" || isActive === "Active";
    query = query.where({ is_active: activeBool });
  }

  if (search) {
    query = query.where(function () {
      this.whereILike("title", `%${search}%`)
        .orWhereILike("highlight", `%${search}%`)
        .orWhereILike("tag", `%${search}%`)
        .orWhereILike("subtitle", `%${search}%`);
    });
  }

  return query
    .orderBy(sortBy, sortOrder)
    .limit(limit)
    .offset(offset);
}

function countSliders({ search, isActive } = {}) {
  let query = db("hero_sliders");

  if (isActive !== undefined && isActive !== "" && isActive !== "all") {
    const activeBool = isActive === true || isActive === "true" || isActive === "Active";
    query = query.where({ is_active: activeBool });
  }

  if (search) {
    query = query.where(function () {
      this.whereILike("title", `%${search}%`)
        .orWhereILike("highlight", `%${search}%`)
        .orWhereILike("tag", `%${search}%`)
        .orWhereILike("subtitle", `%${search}%`);
    });
  }

  return query
    .count("id as count")
    .first()
    .then((row) => Number(row?.count || 0));
}

async function getSliderStats() {
  const [totalRow, activeRow] = await Promise.all([
    db("hero_sliders").count("id as count").first(),
    db("hero_sliders").where({ is_active: true }).count("id as count").first(),
  ]);

  const total = Number(totalRow?.count || 0);
  const active = Number(activeRow?.count || 0);
  const inactive = Math.max(0, total - active);

  return { total, active, inactive };
}

function findSliderById(id) {
  return db("hero_sliders").where({ id }).first();
}

async function getMaxDisplayOrder() {
  const row = await db("hero_sliders").max("display_order as max_order").first();
  return Number(row?.max_order || 0);
}

function createSlider(data) {
  return db("hero_sliders")
    .insert(data)
    .returning(HERO_SLIDER_COLUMNS)
    .then((rows) => rows[0]);
}

function updateSlider(id, data) {
  return db("hero_sliders")
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning(HERO_SLIDER_COLUMNS)
    .then((rows) => rows[0]);
}

function deleteSlider(id) {
  return db("hero_sliders").where({ id }).del();
}

async function reorderSliders(orderedItems) {
  // orderedItems is an array of { id, display_order }
  return db.transaction(async (trx) => {
    for (const item of orderedItems) {
      await trx("hero_sliders")
        .where({ id: item.id })
        .update({
          display_order: item.display_order,
          updated_at: trx.fn.now(),
        });
    }
  });
}

module.exports = {
  HERO_SLIDER_COLUMNS,
  findActiveSliders,
  findSliders,
  countSliders,
  getSliderStats,
  findSliderById,
  getMaxDisplayOrder,
  createSlider,
  updateSlider,
  deleteSlider,
  reorderSliders,
};

