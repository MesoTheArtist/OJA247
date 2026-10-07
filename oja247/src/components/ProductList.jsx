import React, { useState, useEffect } from 'react';
import { getProductsByBusiness, updateProduct, deleteProduct } from '../services/api';
import { useDialog } from './DialogProvider';

const ProductList = ({ businessId }) => {
  const { confirm, notify } = useDialog();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  useEffect(() => {
    fetchProducts();
  }, [businessId]);

  const fetchProducts = async () => {
    try {
      const response = await getProductsByBusiness(businessId);
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (productId) => {
    const ok = await confirm({
      title: 'Delete product?',
      message: 'Are you sure you want to delete this product?',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await deleteProduct(productId);
      setProducts(products.filter(p => p._id !== productId));
      notify({ title: 'Product deleted', message: 'The product was deleted.', tone: 'success' });
    } catch (error) {
      notify({ title: 'Could not delete product', message: 'Please try again.', tone: 'error' });
      console.error('Error deleting product:', error);
    }
  };

  const startEdit = (product) => {
    setEditingProduct(product._id);
    setEditFormData({
      name: product.name,
      description: product.description,
      price: product.price,
      stock: product.stock,
      category: product.category
    });
  };

  const cancelEdit = () => {
    setEditingProduct(null);
    setEditFormData({});
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const saveEdit = async (productId) => {
    try {
      const response = await updateProduct(productId, {
        ...editFormData,
        price: parseFloat(editFormData.price),
        stock: parseInt(editFormData.stock)
      });
      
      setProducts(products.map(p => p._id === productId ? response.data : p));
      setEditingProduct(null);
      notify({ title: 'Product updated', message: 'Your changes were saved.', tone: 'success' });
    } catch (error) {
      notify({ title: 'Could not update product', message: 'Please try again.', tone: 'error' });
      console.error('Error updating product:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg text-gray-600">Loading products...</div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12 bg-green-50/50 rounded-2xl border border-green-100">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No products</h3>
        <p className="mt-1 text-sm text-gray-500">Get started by adding your first product.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-gray-800 mb-4">
        Your Products ({products.length})
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map(product => (
          <div key={product._id} className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
            {/* Product Image */}
            <div className="h-48 bg-gray-100 overflow-hidden">
              {product.images && product.images[0] ? (
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="p-4">
              {editingProduct === product._id ? (
                // Edit Mode
                <div className="space-y-3">
                  <input
                    type="text"
                    name="name"
                    value={editFormData.name}
                    onChange={handleEditChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <textarea
                    name="description"
                    value={editFormData.description}
                    onChange={handleEditChange}
                    rows="2"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      name="price"
                      value={editFormData.price}
                      onChange={handleEditChange}
                      className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <input
                      type="number"
                      name="stock"
                      value={editFormData.stock}
                      onChange={handleEditChange}
                      className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(product._id)}
                      className="flex-1 py-2 bg-gradient-to-r from-green-600 to-yellow-500 text-white rounded-lg font-medium hover:opacity-90 transition"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <>
                  <h4 className="font-semibold text-lg text-gray-800 mb-1 truncate">
                    {product.name}
                  </h4>
                  <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                    {product.description}
                  </p>
                  <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                    <span className="text-lg font-bold text-green-600">
                      ₦{product.price.toLocaleString()}
                    </span>
                    <span className={`text-sm px-2 py-1 rounded-full font-medium ${
                      product.inStock 
                        ? 'bg-green-100 text-green-800 border border-green-200' 
                        : 'bg-red-100 text-red-800 border border-red-200'
                    }`}>
                      {product.inStock ? `${product.stock} in stock` : 'Out of stock'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(product)}
                      className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(product._id)}
                      className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium transition"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductList;