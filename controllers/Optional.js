exports.paymentWebhook = async (req, res) => {
  try {
    const { PaymentId } = req.body;

    // Verify payment status
    const response = await axios.post(
      `${process.env.MYFATOORAH_BASE_URL}/v2/getPaymentStatus`,
      { PaymentId },
      {
        headers: {
          Authorization: `Bearer ${process.env.MYFATOORAH_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const order = await Order.findOne({ paymentId: PaymentId });

    if (response.data.Data.InvoiceStatus === 'Paid' && order) {
      order.isPaid = true;
      order.status = 'completed';
      await order.save();
    }

    res.status(StatusCodes.OK).json({ success: true });
  } catch (error) {
    console.error(`Webhook Error: ${error.message}`);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false });
  }
};
