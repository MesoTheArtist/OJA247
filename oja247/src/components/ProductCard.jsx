function ProductCard({ product }) {
  return (
    <div className="border rounded-lg shadow hover:shadow-lg transition p-3">
      <img
        src={product.image || "/placeholder.svg"}
        alt={product.name}
        className="w-full h-40 object-cover rounded"
      />

      <h3 className="font-semibold text-lg mt-2">{product.name}</h3>

      <p className="text-gray-700 text-sm">{product.description}</p>

      <p className="text-blue-600 font-bold mt-2">₦{product.price}</p>
    </div>
  );
}

export default ProductCard;
