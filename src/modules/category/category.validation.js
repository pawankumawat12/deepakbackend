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

function parseOptionalParentCategoryId(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === "null") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return NaN;
  }

  return parsed;
}

function validateCategoryCreate({ name, description, parentCategoryId, isActive }) {
  const errors = {};

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    errors.name = "Name is required and must be at least 2 characters.";
  } else if (name.trim().length > 150) {
    errors.name = "Name must not exceed 150 characters.";
  }

  if (description !== undefined && description !== null) {
    if (typeof description !== "string") {
      errors.description = "Description must be a string.";
    } else if (description.length > 2000) {
      errors.description = "Description must not exceed 2000 characters.";
    }
  }

  if (parentCategoryId !== undefined && parentCategoryId !== null) {
    const parsed = Number(parentCategoryId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      errors.parentCategoryId = "Parent category ID must be a positive integer.";
    }
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
      parent_category_id:
        parentCategoryId === undefined || parentCategoryId === null
          ? null
          : Number(parentCategoryId),
      is_active: parsedIsActive === undefined ? true : parsedIsActive,
    },
  };
}

function validateCategoryUpdate({ name, description, parentCategoryId, isActive }) {
  const errors = {};
  const data = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters.";
    } else if (name.trim().length > 150) {
      errors.name = "Name must not exceed 150 characters.";
    } else {
      data.name = name.trim();
    }
  }

  if (description !== undefined) {
    if (description !== null && typeof description !== "string") {
      errors.description = "Description must be a string.";
    } else if (description && description.length > 2000) {
      errors.description = "Description must not exceed 2000 characters.";
    } else {
      data.description = description === null ? null : description.trim();
    }
  }

  if (parentCategoryId !== undefined) {
    if (parentCategoryId === null || parentCategoryId === "null") {
      data.parent_category_id = null;
    } else {
      const parsed = Number(parentCategoryId);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        errors.parentCategoryId = "Parent category ID must be a positive integer.";
      } else {
        data.parent_category_id = parsed;
      }
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

function validateCategoryListQuery({ parentCategoryId, isActive }) {
  const errors = {};
  const filters = {};

  if (parentCategoryId !== undefined) {
    const parsed = parseOptionalParentCategoryId(parentCategoryId);
    if (Number.isNaN(parsed)) {
      errors.parentCategoryId = "Parent category ID must be a positive integer or null.";
    } else {
      filters.parentCategoryId = parsed;
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

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    filters,
  };
}

module.exports = {
  validateCategoryCreate,
  validateCategoryUpdate,
  validateCategoryListQuery,
};
