// controllers/popularController.js
const Popular = require('../../models/Popular');
const Product = require('../../models/Product');

// Add a new popular item with unique orderNumber handling.
const addPopular = async (req, res) => {
  try {
    let { product, orderNumber } = req.body;
    if (!product) {
      return res.status(400).json({ error: 'Product id is required.' });
    }
    const isProductExists = await Product.exists({_id:product});
    if(!isProductExists)
    {
      const error = new Error('No product has this id');
      error.statusCode = 400;
      throw error;
    }

    let desiredOrderNumber;

    const lastPopular = await Popular.findOne().sort({ orderNumber: -1 }) || {orderNumber: 0};
    if(orderNumber > lastPopular.orderNumber+1)
    {
      orderNumber = lastPopular.orderNumber+1
    }
    if (orderNumber === undefined || orderNumber === null) {
      // If no orderNumber is provided, assign the next available number.
      desiredOrderNumber = lastPopular ? lastPopular?.orderNumber + 1 : 1;
    } else {
      desiredOrderNumber = parseInt(orderNumber,10);
      if (isNaN(desiredOrderNumber)) {
        return res
          .status(400)
          .json({ error: 'Invalid orderNumber. It must be a number.' });
      }
    }

    // Shift all popular items having orderNumber >= desiredOrderNumber.
    const docsToUpdate = await Popular.find({
      orderNumber: { $gte: desiredOrderNumber }
    }).sort({ orderNumber: -1 }); // Sort descending!
    
    // 2. Update sequentially
    for (const doc of docsToUpdate) {
      await Popular.updateOne(
        { _id: doc._id },
        { $inc: { orderNumber: 1 } }
      );
    }
    // Create and save the new popular item.
    const newPopular = new Popular({
      product,
      orderNumber: desiredOrderNumber,
    });
    const savedPopular = await newPopular.save();

    res.status(201).json(savedPopular);
  } catch (error) {
    console.error('Error adding popular:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete a popular item and shift remaining items to close the gap.
const deletePopular = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the popular item to be deleted.
    const popularToDelete = await Popular.findById(id);
    if (!popularToDelete) {
      return res.status(404).json({ error: 'Popular item not found.' });
    }

    const deletedOrderNumber = popularToDelete.orderNumber;
    await popularToDelete.deleteOne();

    // Shift down the order numbers of items that followed the deleted one.
    const docsToUpdate = await Popular.find({
      orderNumber: { $gte: deletedOrderNumber }
    }).sort({ orderNumber: 1 }); // Sort descending!
    
    // 2. Update sequentially
    for (const doc of docsToUpdate) {
      await Popular.updateOne(
        { _id: doc._id },
        { $inc: { orderNumber: -1 } }
      );
    }
    res.status(200).json({ message: 'Popular item deleted successfully.' });
  } catch (error) {
    console.error('Error deleting popular:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  addPopular,
  deletePopular,
};
