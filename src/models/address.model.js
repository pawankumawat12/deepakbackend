const knex = require("../../config/db");

const TABLE = "addresses";

const createAddress = async (addressData) => {
  // Ensure latitude and longitude are present to satisfy NOT NULL DB constraints
  if (addressData.latitude == null) addressData.latitude = 0;
  if (addressData.longitude == null) addressData.longitude = 0;
  if (addressData.is_default) {
    await knex(TABLE)
      .where({ user_id: addressData.user_id })
      .update({ is_default: false });
  }

  const [id] = await knex(TABLE)
    .insert(addressData)
    .returning("id");

  return getAddressById(id.id || id);
};

const getAddressById = async (id, userId = null) => {
  let query = knex(TABLE).where({ id });

  if (userId) {
    query = query.where({ user_id: userId });
  }

  return query.first();
};

const getAddressesByUserId = async (userId) => {
  return knex(TABLE)
    .where({ user_id: userId })
    .orderBy("created_at", "desc");
};

const updateAddress = async (id, userId, updateData) => {
  if (updateData.is_default) {
    await knex(TABLE)
      .where({ user_id: userId })
      .update({ is_default: false });
  }

  await knex(TABLE)
    .where({ id, user_id: userId })
    .update({
      ...updateData,
      updated_at: knex.fn.now(),
    });

  return getAddressById(id, userId);
};

const deleteAddress = async (id, userId) => {
  return knex(TABLE)
    .where({ id, user_id: userId })
    .del();
};

const setDefaultAddress = async (id, userId) => {
  await knex(TABLE)
    .where({ user_id: userId })
    .update({ is_default: false });

  return knex(TABLE)
    .where({ id, user_id: userId })
    .update({ is_default: true });
};

module.exports = {
  createAddress,
  getAddressById,
  getAddressesByUserId,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
};