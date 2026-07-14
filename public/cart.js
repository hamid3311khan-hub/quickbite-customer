function goToCart(){
  let cart = JSON.parse(localStorage.getItem('cart')) || [];
  if(cart.length === 0) return alert("Cart khali hai bhai");
  window.location.href = '/cart.html';
}