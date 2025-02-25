const axios = require('axios');
const Order = require('../models/Order');
const { OrderStatus } = require('../util/types');

// controllers/paymentController.js

// 1. Payment Success Callback
exports.paymentSuccess = async (req, res) => {
  try {
    console.log('Payment suceess hit.');
    const { paymentId } = req.query;

    // Verify payment
    const verification = await axios.post(
      `${process.env.MYFATOORAH_BASE_URL}/v2/GetPaymentStatus`,
      { Key: paymentId, KeyType: 'PaymentId' },
      { headers: { Authorization: `Bearer ${process.env.MYFATOORAH_API_KEY}` } }
    );

    // Update order
    console.log(verification.data.Data);
    await Order.findOneAndUpdate(
      { invoiceId: verification.data.Data.InvoiceId },
      {
        isPaid: true,
        status: OrderStatus.processing,
        paymentDetails: verification.data.Data,
      }
    );

    // Redirect to frontend success page
    // res.redirect(`${process.env.FRONTEND_URL}/order-success`);
    res.redirect(`https://www.google.com`);
  } catch (error) {
    console.error('Payment Success Error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/payment-error`);
  }
};

exports.paymentError = async (req, res) => {
  try {
    // Capture all possible error parameters
    const errorData = {
      queryParams: req.query,
      paymentId: req.query.paymentId,
      invoiceId: req.query.invoiceId || req.query.InvoiceId,
      error: req.query.error || req.query.Error,
      errorCode: req.query.errorCode || req.query.ErrorCode,
    };

    // Attempt to verify payment status using available ID
    let verification = null;
    const key = errorData.invoiceId || errorData.paymentId;
    const keyType = errorData.invoiceId ? 'InvoiceId' : 'PaymentId';

    if (key) {
      verification = await axios.post(
        `${process.env.MYFATOORAH_BASE_URL}/v2/GetPaymentStatus`,
        { Key: key, KeyType: keyType },
        {
          headers: {
            Authorization: `Bearer ${process.env.MYFATOORAH_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.error('Payment Verification Error Details:', verification?.data);
    } else {
      console.error(
        'No valid key (invoiceId or paymentId) found for verification.'
      );
    }

    // Update order with error details
    // Update order with error details
    if (verification && verification.data.IsSuccess) {
      const invoiceId = verification.data.Data.InvoiceId;

      await Order.findOneAndUpdate(
        { invoiceId: invoiceId },
        {
          status: OrderStatus.failed,
          paymentDetails: {
            error:
              errorData.error ||
              verification.data.Data.InvoiceTransactions[0]?.Error,
            errorCode:
              errorData.errorCode ||
              verification.data.Data.InvoiceTransactions[0]?.ErrorCode,
            fullError: errorData,
            verificationResponse: verification.data,
          },
        }
      );
    } else {
      console.error('Verification failed or verification data is missing.');
    }

    // Optionally redirect or render an error page
    // res.redirect(`${process.env.FRONTEND_URL}/payment-error`);
    res.redirect(`https://www.keybr.com`);
  } catch (error) {
    console.error('Error Handling Failed:', error);
    res.redirect(`${process.env.FRONTEND_URL}/error`);
  }
};
