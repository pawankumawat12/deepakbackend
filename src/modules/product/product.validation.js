function parseOptionalBoolean(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  return null;
}

function validatePrice(price) {
  const parsed = Number(price);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function validateProductCreate({
  name,
  description,
  price,
  images,
  stock,
  categoryId,
  isActive,
}) {
  const errors = {};

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    errors.name = "Name is required and must be at least 2 characters.";
  } else if (name.trim().length > 200) {
    errors.name = "Name must not exceed 200 characters.";
  }

  if (description !== undefined && description !== null) {
    if (typeof description !== "string") {
      errors.description = "Description must be a string.";
    } else if (description.length > 5000) {
      errors.description = "Description must not exceed 5000 characters.";
    }
  }

  if (images.lenght <= 0) {
    errors.images = "At list one image is required.";
  }
  const parsedPrice = validatePrice(price);
  if (parsedPrice === null) {
    errors.price = "Price is required and must be a non-negative number.";
  }

  let parsedStock = 0;
  if (stock !== undefined && stock !== null && stock !== "") {
    parsedStock = Number(stock);
    if (!Number.isInteger(parsedStock) || parsedStock < 0) {
      errors.stock = "Stock must be a non-negative integer.";
    }
  }

  const parsedCategoryId = Number(categoryId);
  if (!Number.isInteger(parsedCategoryId) || parsedCategoryId <= 0) {
    errors.categoryId =
      "Category ID is required and must be a positive integer.";
  }

  const parsedIsActive = parseOptionalBoolean(isActive);
  if (parsedIsActive === null) {
    errors.isActive = "isActive must be a boolean value.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: {
      name: typeof name === "string" ? name.trim() : name,
      description:
        description === undefined || description === null
          ? null
          : String(description).trim(),
      price: parsedPrice,
      stock: parsedStock,
      category_id: parsedCategoryId,
      is_active: parsedIsActive === undefined ? true : parsedIsActive,
    },
  };
}

function validateProductUpdate({
  name,
  description,
  price,
  stock,
  images,
  categoryId,
  isActive,
}) {
  const errors = {};
  const data = {};
if(images.length <= 0){
  errors.images = "At list one image is required."
}
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters.";
    } else if (name.trim().length > 200) {
      errors.name = "Name must not exceed 200 characters.";
    } else {
      data.name = name.trim();
    }
  }

  if (description !== undefined) {
    if (description !== null && typeof description !== "string") {
      errors.description = "Description must be a string.";
    } else if (description && description.length > 5000) {
      errors.description = "Description must not exceed 5000 characters.";
    } else {
      data.description = description === null ? null : description.trim();
    }
  }

  if (price !== undefined) {
    const parsedPrice = validatePrice(price);
    if (parsedPrice === null) {
      errors.price = "Price must be a non-negative number.";
    } else {
      data.price = parsedPrice;
    }
  }

  if (stock !== undefined) {
    const parsedStock = Number(stock);
    if (!Number.isInteger(parsedStock) || parsedStock < 0) {
      errors.stock = "Stock must be a non-negative integer.";
    } else {
      data.stock = parsedStock;
    }
  }

  if (categoryId !== undefined) {
    const parsedCategoryId = Number(categoryId);
    if (!Number.isInteger(parsedCategoryId) || parsedCategoryId <= 0) {
      errors.categoryId = "Category ID must be a positive integer.";
    } else {
      data.category_id = parsedCategoryId;
    }
  }

  if (isActive !== undefined) {
    const parsedIsActive = parseOptionalBoolean(isActive);
    if (parsedIsActive === null) {
      errors.isActive = "isActive must be a boolean value.";
    } else {
      data.is_active = parsedIsActive;
    }
  }

  if (Object.keys(data).length === 0 && Object.keys(errors).length === 0) {
    errors._general = "At least one field is required to update.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data,
  };
}

function validateProductListQuery({ categoryId, isActive, search }) {
  const errors = {};
  const filters = {};

  if (categoryId !== undefined) {
    const parsed = Number(categoryId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      errors.categoryId = "Category ID must be a positive integer.";
    } else {
      filters.categoryId = parsed;
    }
  }

  if (isActive !== undefined) {
    const parsedIsActive = parseOptionalBoolean(isActive);
    if (parsedIsActive === null) {
      errors.isActive = "isActive must be a boolean value.";
    } else {
      filters.isActive = parsedIsActive;
    }
  }

  if (search !== undefined) {
    if (typeof search !== "string" || search.trim().length === 0) {
      errors.search = "Search must be a non-empty string.";
    } else if (search.trim().length > 100) {
      errors.search = "Search must not exceed 100 characters.";
    } else {
      filters.search = search.trim();
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    filters,
  };
}

module.exports = {
  validateProductCreate,
  validateProductUpdate,
  validateProductListQuery,
};
