const db = require("../../config/db");

const CATEGORY_COLUMNS = [
  "id",
  "name",
  "description",
  "image",
  "parent_category_id",
  "is_active",
  "created_at",
  "updated_at",
];

function findCategoryById(id) {
  return db("categories").where({ id }).first();
}

function findCategories({
  page,
  limit,
  offset,
  parentCategoryId,
  isActive,
  search,
  sortBy = "created_at",
  sortOrder = "desc",
}) {
  let query = db("categories").select(CATEGORY_COLUMNS);

  if (parentCategoryId !== undefined) {
    if (parentCategoryId === null || parentCategoryId === "null") {
      query = query.whereNull("parent_category_id");
    } else {
      query = query.where({ parent_category_id: parentCategoryId });
    }
  }

  if (isActive !== undefined) {
    query = query.where({ is_active: isActive });
  }

  if (search) {
    query = query.where(function () {
      this.whereILike("name", `%${search}%`).orWhereILike(
        "description",
        `%${search}%`,
      );
    });
  }

  return query
    .orderBy(sortBy, sortOrder)
    .limit(limit)
    .offset(offset);
}

function countCategories({ parentCategoryId, isActive, search }) {
  let query = db("categories");

  if (parentCategoryId !== undefined) {
    if (parentCategoryId === null || parentCategoryId === "null") {
      query = query.whereNull("parent_category_id");
    } else {
      query = query.where({ parent_category_id: parentCategoryId });
    }
  }

  if (isActive !== undefined) {
    query = query.where({ is_active: isActive });
  }

  if (search) {
    query = query.where(function () {
      this.whereILike("name", `%${search}%`).orWhereILike(
        "description",
        `%${search}%`,
      );
    });
  }

  return query
    .count("id as count")
    .first()
    .then((row) => Number(row.count || 0));
}

function countChildCategories(parentCategoryId) {
  return db("categories")
    .where({ parent_category_id: parentCategoryId })
    .count("id as count")
    .first()
    .then((row) => Number(row.count || 0));
}

function createCategory(data) {
  return db("categories")
    .insert(data)
    .returning(CATEGORY_COLUMNS)
    .then((rows) => rows[0]);
}

function updateCategory(id, data) {
  return db("categories")
    .where({ id })
    .update(data)
    .returning(CATEGORY_COLUMNS)
    .then((rows) => rows[0]);
}

function deleteCategory(id) {
  return db("categories").where({ id }).del();
}

async function isCategoryAncestor(ancestorId, descendantId) {
  let currentId = descendantId;

  while (currentId) {
    if (Number(currentId) === Number(ancestorId)) {
      return true;
    }

    const category = await findCategoryById(currentId);
    if (!category || !category.parent_category_id) {
      return false;
    }

    currentId = category.parent_category_id;
  }

  return false;
}

module.exports = {
  findCategoryById,
  findCategories,
  countCategories,
  countChildCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  isCategoryAncestor,
};
