function goToCart(){
  let cart = JSON.parse(localStorage.getItem('cart')) || [];
  if(cart.length === 0) return alert("Cart khali hai bhai");
  window.location.href = '/cart.html';
}
<script src="payment.js"></script>  <!-- NAYA -->
<script>
  let cart = JSON.parse(localStorage.getItem('cart')) || [];
  document.getElementById('cart-items').innerHTML = cart.map(i=>`<div>${i.name} - ₹${i.price}</div>`).join('');
  document.getElementById('total').innerText = cart.reduce((s,i)=>s+i.price,0);
</script>