async function loadMenu() {
  try {
    const res = await fetch('/api/products');
    const products = await res.json();
    const menuDiv = document.getElementById('menu');
    const loading = document.getElementById('loading');
    
    loading.style.display = 'none';
    
    if(products.length === 0){
      menuDiv.innerHTML = "<p>Abhi menu khali hai. Admin se products add karwao.</p>";
      return;
    }
    
    products.forEach(item => {
      menuDiv.innerHTML += `
        <div class="item">
          <img src="${item.image}" alt="${item.name}">
          <h3>${item.name}</h3>
          <p>${item.category}</p>
          <p class="price">Rs ${item.price}</p>
        </div>
      `;
    });
  } catch(err){
    document.getElementById('loading').innerText = "Menu load nahi ho raha";
    console.log(err)
  }
}

loadMenu();