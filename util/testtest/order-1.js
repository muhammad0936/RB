exports.executePayment = async (req, res) => {
  try {
    const customerId = req.userId;
    const { paymentMethod, deliveryAddress, couponCode, isUrgent } = req.body;

    // 1. Re-validate all calculations (prevent tampering)
    const customer = await Customer.findById(customerId)
      .populate({
        path: 'cart.product',
        select: 'title price weight availableSizes',
      })
      .lean();

    // Repeat all validations from checkoutPreview
    // (address hierarchy, coupon validity, cart items, etc.)

    // Re-calculate totals
    let totalProductPrice = 0;
    let totalWeight = 0;
    const cartItems = customer.cart.map((item) => {
      const itemTotal = item.product.price * item.quantity;
      totalProductPrice += itemTotal;
      totalWeight += item.product.weight * item.quantity;
      return item;
    });

    // Re-calculate delivery cost
    const state = await State.findById(deliveryAddress.state);
    const deliveryCost =
      parseFloat(state.firstKiloDeliveryCost) +
      Math.ceil(Math.max(0, totalWeight - 1)) *
        parseFloat(state.deliveryCostPerKilo);

    // Re-apply coupon logic
    let discount = 0;
    // ... (repeat coupon validation and calculation)

    const totalAmount = totalProductPrice + deliveryCost - discount;

    // 2. Create Order
    const order = new Order({
      customer: customerId,
      products: customer.cart.map((item) => ({
        product: item.product._id,
        price: item.product.price,
        size: item.size,
        quantity: item.quantity,
      })),
      totalAmount,
      deliveryCost,
      deliveryAddress,
      status: 'pending',
      isUrgent,
    });

    // 3. Prepare MyFatoorah payload
    const paymentPayload = {
      PaymentMethodId: paymentMethod === 'knet' ? '2' : '1', // Example IDs
      CustomerName: customer.name,
      CustomerEmail: customer.email,
      CustomerMobile: customer.phone,
      InvoiceValue: totalAmount,
      DisplayCurrencyIso: 'KWD',
      CallBackUrl: `${process.env.API_URL}/payment/callback`,
      ErrorUrl: `${process.env.API_URL}/payment/error`,
      InvoiceItems: customer.cart.map((item) => ({
        ItemName: item.product.title,
        Quantity: item.quantity,
        UnitPrice: item.product.price,
      })),
      CustomerAddress: {
        Block: deliveryAddress.block || '',
        Street: deliveryAddress.street || '',
        HouseBuildingNo: deliveryAddress.building?.number || '',
      },
    };

    // 4. Execute Payment
    const paymentResponse = await axios.post(
      `${process.env.MYFATOORAH_BASE_URL}/v2/ExecutePayment`,
      paymentPayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.MYFATOORAH_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // 5. Update Order with payment ID
    order.paymentId = paymentResponse.data.Data.PaymentId;
    await order.save();

    // 6. Empty Cart (only if payment initiated successfully)
    await Customer.findByIdAndUpdate(customerId, { $set: { cart: [] } });

    res.status(StatusCodes.OK).json({
      success: true,
      paymentUrl: paymentResponse.data.Data.PaymentURL,
      orderId: order._id,
    });
  } catch (error) {
    console.error(`Payment Execution Error: ${error.message}`);

    // Specific error handling for MyFatoorah
    const errorMessage =
      error.response?.data?.Data?.ErrorMessage || 'Payment processing failed';

    res.status(error.response?.status || 500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};
