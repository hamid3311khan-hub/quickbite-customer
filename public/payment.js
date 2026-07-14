async function placeOrder(){
  let cart = JSON.parse(localStorage.getItem('cart')) || [];
  if(cart.length === 0) return alert("Cart khali hai");
  
  let total = cart.reduce((sum, item) => sum + item.price, 0);
  
  // 1. Backend pe order banao
  const res = await fetch('/api/create-order', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({amount: total * 100}) // paise me
  });
  const data = await res.json();

  // 2. Razorpay popup kholega
  var options = {
    "key": "rzp_test_XXXXXXXXXXXX", // apni test key daal
    "amount": data.amount,
    "currency": "INR",
    "name": "QuickBite",
    "order_id": data.id,
    "handler": async function (response){
      // 3. Payment success hua to DB me save
      await fetch('/api/orders', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({items: cart, total: total, status: "Paid", payment_id: response.razorpay_payment_id})
      });
      
      alert("✅ Payment Success! Order Placed");
      localStorage.removeItem('cart'); 
      window.location.href = '/';
    }
  };
  var rzp = new Razorpay(options);
  rzp.open();
}