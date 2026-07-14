async function placeOrder(){
  let cart = JSON.parse(localStorage.getItem('cart')) || [];
  if(cart.length === 0) return alert("Cart khali hai");
  
  let total = cart.reduce((sum, item) => sum + item.price, 0);
  
  // DB me order save
  await fetch('/api/orders', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({items: cart, total: total, status: "Paid"})
  });
  
  alert("✅ Order Placed! Total: ₹" + total);
  
  // YE LINE CART ZERO KARTI HAI
  localStorage.removeItem('cart'); 
  window.location.href = '/';
}