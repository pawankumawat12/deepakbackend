const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const createRazorpayOrder = async ({
  amount,
  receipt,
  notes = {},
}) => {
  const options = {
    amount: Math.round(Number(amount) * 100),
    currency: "INR",
    receipt,
    notes,
  };

  return await razorpay.orders.create(options);
};

module.exports = {
  razorpay,
  createRazorpayOrder,
};