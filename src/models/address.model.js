const knex = require("../../config/db");

class Address {
  static get tableName() {
    return "addresses";
  }

  static async create(addressData) {
    if (addressData.is_default) {
      await knex(this.tableName)
        .where({ user_id: addressData.user_id })
        .update({ is_default: false });
    }

    const [id] = await knex(this.tableName).insert(addressData).returning("id");
    return this.findById(id.id || id); // Handle different return formats based on DB (pg vs sqlite)
  }

  static async findById(id) {
    return knex(this.tableName).where({ id }).first();
  }

  static async findByUserId(userId) {
    return knex(this.tableName).where({ user_id: userId }).orderBy("created_at", "desc");
  }

  static async update(id, userId, updateData) {
    if (updateData.is_default) {
      await knex(this.tableName)
        .where({ user_id: userId })
        .update({ is_default: false });
    }
    
    updateData.updated_at = knex.fn.now();
    await knex(this.tableName).where({ id, user_id: userId }).update(updateData);
    return this.findById(id);
  }

  static async delete(id, userId) {
    return knex(this.tableName).where({ id, user_id: userId }).del();
  }

  static async setDefault(id, userId) {
    await knex(this.tableName).where({ user_id: userId }).update({ is_default: false });
    return knex(this.tableName).where({ id, user_id: userId }).update({ is_default: true });
  }
}

module.exports = Address;
