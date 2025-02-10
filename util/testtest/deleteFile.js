exports.verifyPayment = async (req, res) => {
  try {
    const { paymentId, orderId } = req.body;

    if (!paymentId || !orderId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Payment ID and Order ID are required',
      });
    }

    // Fetch payment details from MyFatoorah
    const response = await axios.get(
      `${process.env.MYFATOORAH_BASE_URL}/v2/GetPaymentStatus`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MYFATOORAH_API_KEY}`,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        data: { Key: paymentId, KeyType: 'PaymentId' },
      }
    );

    const paymentStatus = response.data.Data.InvoiceStatus;

    // Update order status based on payment status
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (paymentStatus === 'Paid') {
      order.status = 'completed';
      await order.save();
      return res.status(StatusCodes.OK).json({
        success: true,
        message: 'Payment verified and order completed',
      });
    } else {
      order.status = 'failed';
      await order.save();
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Payment failed',
      });
    }
  } catch (error) {
    console.error(`Verify Payment Error: ${error.message}`);

    const statusCode =
      error.response?.status || StatusCodes.INTERNAL_SERVER_ERROR;
    const message =
      error.response?.data?.message || 'Payment verification failed';

    res.status(statusCode).json({
      success: false,
      message,
      error:
        process.env.NODE_ENV === 'development'
          ? {
              stack: error.stack,
              details: error.response?.data,
            }
          : undefined,
    });
  }
};
