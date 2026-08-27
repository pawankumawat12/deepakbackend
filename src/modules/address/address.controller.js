const Address = require("../../models/address.model");

const addressController = {
  createAddress: async (req, res) => {
    try {
      const userId = req.user.id;
      const addressData = { ...req.body, user_id: userId };
      
      const newAddress = await Address.create(addressData);
      res.status(201).json({
        success: true,
        message: "Address created successfully",
        data: newAddress,
      });
    } catch (error) {
      console.error("Error creating address:", error);
      res.status(500).json({ success: false, message: "Error creating address" });
    }
  },

  getAddresses: async (req, res) => {
    try {
      const userId = req.user.id;
      const addresses = await Address.findByUserId(userId);
      res.status(200).json({
        success: true,
        data: addresses,
      });
    } catch (error) {
      console.error("Error fetching addresses:", error);
      res.status(500).json({ success: false, message: "Error fetching addresses" });
    }
  },

  updateAddress: async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      
      const updatedAddress = await Address.update(id, userId, req.body);
      if (!updatedAddress) {
        return res.status(404).json({ success: false, message: "Address not found" });
      }

      res.status(200).json({
        success: true,
        message: "Address updated successfully",
        data: updatedAddress,
      });
    } catch (error) {
      console.error("Error updating address:", error);
      res.status(500).json({ success: false, message: "Error updating address" });
    }
  },

  deleteAddress: async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      
      const deleted = await Address.delete(id, userId);
      if (!deleted) {
        return res.status(404).json({ success: false, message: "Address not found" });
      }

      res.status(200).json({
        success: true,
        message: "Address deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting address:", error);
      res.status(500).json({ success: false, message: "Error deleting address" });
    }
  },
  
  setDefaultAddress: async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      
      await Address.setDefault(id, userId);
      
      res.status(200).json({
        success: true,
        message: "Default address updated",
      });
    } catch (error) {
      console.error("Error setting default address:", error);
      res.status(500).json({ success: false, message: "Error setting default address" });
    }
  }
};

module.exports = addressController;

