var request = require('request');
var token = 'mytokenvalue'; //token value to be placed here;
var baseURL = 'https://apitest.myfatoorah.com';
var options = {
  method: 'POST',
  url: baseURL + '/v2/ExecutePayment',
  headers: {
    Accept: 'application/json',
    Authorization: 'bearer ' + token,
    'Content-Type': 'application/json',
  },
  body: {
    PaymentMethodId: '2',
    CustomerName: 'Ahmed',
    DisplayCurrencyIso: 'KWD',
    MobileCountryCode: '+965',
    CustomerMobile: '12345678',
    CustomerEmail: 'xx@yy.com',
    InvoiceValue: 100,
    CallBackUrl: 'https://google.com',
    ErrorUrl: 'https://google.com',
    Language: 'en',
    CustomerReference: 'ref 1',
    CustomerCivilId: 12345678,
    UserDefinedField: 'Custom field',
    ExpireDate: '',
    CustomerAddress: {
      Block: '',
      Street: '',
      HouseBuildingNo: '',
      Address: '',
      AddressInstructions: '',
    },
    InvoiceItems: [{ ItemName: 'Product 01', Quantity: 1, UnitPrice: 100 }],
  },
  json: true,
};

request(options, function (error, response, body) {
  if (error) throw new Error(error);
  console.log(body);
  var paymentURL = body['Data']['PaymentURL'];
  console.log(paymentURL);
  payInvoice(paymentURL);
});

function payInvoice(paymentURL) {
  var options = {
    method: 'POST',
    url: paymentURL,
    headers: {
      Accept: 'application/json',
      Authorization: 'bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: {
      paymentType: 'card',
      card: {
        Number: '5123450000000008',
        expiryMonth: '05',
        expiryYear: '21',
        securityCode: '100',
      },
      saveToken: false,
    },
    json: true,
  };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);
    console.log(body);
  });
}
