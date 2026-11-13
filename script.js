"use strict";

const $ = (id) => document.getElementById(id);

const fmt = (n) =>
  Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

const photoFallback =
  "data:image/svg+xml," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="220">
    <rect width="100%" height="100%" fill="#292929"/>
    <text x="50%" y="50%" fill="#f39a40" font-size="20"
      text-anchor="middle">Foto em breve</text>
  </svg>`);

let products = [];
let fees = [];
let category = "Todos";
let cart = [];
let delivery = "delivery";
let bairro = "";
let online = false;
let storeIsOpen = true;
let socket = null;
let tracking = localStorage.getItem("cardoso_tracking") || "";

const displayCategory = (p) => {
  const c = norm(p.category);
  if (["hamburguer", "hamburgueres", "lanches"].includes(c)) return "Lanches";
  if (c === "bebidas") return "Bebidas";
  if (c === "pao com linguica") return "Pão com linguiça";
  return p.category;
};

const extras = () => products.filter((p) => norm(p.category) === "adicionais");

const productById = (id) => products.find((p) => p.id === id);

const subtotal = () =>
  cart.reduce((s, item) => s + item.unit * item.quantity, 0);

const fee = () =>
  delivery === "pickup"
    ? 0
    : (fees.find((x) => norm(x.name) === norm(bairro))?.fee ?? null);

const getPhoto = (p) => esc(p.image || photoFallback);

// NOTIFICAÇÕES PERSONALIZADAS (sem alertas do navegador)
function notify(message, type = "warning") {
  const stack = $("toastStack");
  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.setAttribute("role", type === "error" ? "alert" : "status");
  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = type === "success" ? "✓" : type === "error" ? "!" : "i";
  const content = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = type === "success" ? "Tudo certo!" : type === "error" ? "Atenção" : "Aviso";
  const detail = document.createElement("p");
  detail.textContent = String(message);
  content.append(heading, detail);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-close";
  close.textContent = "×";
  close.setAttribute("aria-label", "Fechar aviso");
  close.onclick = () => item.remove();
  item.append(icon, content, close);
  stack.append(item);
  while (stack.children.length > 3) stack.firstElementChild.remove();
  setTimeout(() => item.remove(), 4500);
}

function confirmCard(message, onConfirm) {
  const overlay = $("confirmOverlay");
  $("confirmMessage").textContent = message;
  overlay.hidden = false;
  const cancel = $("confirmCancel");
  const accept = $("confirmAccept");
  const dismiss = () => {
    overlay.hidden = true;
    cancel.onclick = null;
    accept.onclick = null;
    overlay.onclick = null;
  };
  cancel.onclick = dismiss;
  accept.onclick = () => { dismiss(); onConfirm(); };
  overlay.onclick = (e) => { if (e.target === overlay) dismiss(); };
  cancel.focus();
}

// MODAIS
function modal(title, html) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = html;
  $("overlay").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  $("overlay").hidden = true;
  $("overlay").classList.remove("mobile-bag-open");
  document.body.style.overflow = "";
}

$("closeBtn").onclick = closeModal;

$("overlay").addEventListener("click", (e) => {
  if (e.target === $("overlay")) closeModal();
});

// CARDÁPIO
function render() {
  const categories = ["Todos", "Lanches", "Pão com linguiça", "Bebidas"];

  $("categories").innerHTML = categories
    .map(
      (c) => `
    <button data-cat="${esc(c)}" class="${c === category ? "active" : ""}">
      ${c === "Todos" ? "Cardápio completo" : esc(c)}
    </button>
  `,
    )
    .join("");

  $("categories")
    .querySelectorAll("button")
    .forEach((b) => {
      b.onclick = () => {
        category = b.dataset.cat;
        render();
      };
    });

  const q = norm($("search").value);

  const shown = products.filter((p) => {
    const c = displayCategory(p);

    return (
      c !== "Adicionais" &&
      ["Lanches", "Pão com linguiça", "Bebidas"].includes(c) &&
      (category === "Todos" || c === category) &&
      norm(p.name + " " + p.description).includes(q)
    );
  });

  $("products").innerHTML =
    shown
      .map(
        (p) => `
    <button class="product" data-id="${p.id}">
      <div class="details">
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.description)}</p>
        <strong>${fmt(p.price)}</strong>
      </div>
      <img src="${getPhoto(p)}" loading="lazy"
        alt="Foto ilustrativa: ${esc(p.name)}"
        onerror="this.onerror=null;this.src='${photoFallback}'">
    </button>
  `,
      )
      .join("") ||
    `<p class="hint">Nenhum produto disponível nesta categoria.</p>`;

  $("products")
    .querySelectorAll("[data-id]")
    .forEach((b) => {
      b.onclick = () => openProduct(Number(b.dataset.id));
    });

  renderCart();
}

// PERSONALIZAÇÃO DO LANCHE
function openProduct(id, editIndex = null) {
  const p = productById(id);
  if (!p) return;

  const original = editIndex === null ? null : cart[editIndex];
  let chosen = new Set(original?.extraIds || []);
  let qty = original?.quantity || 1;

  const canCustomize = ["Lanches", "Pão com linguiça"].includes(
    displayCategory(p),
  );

  modal(
    p.name,
    `
    <img class="modal-photo" src="${getPhoto(p)}"
      alt="Foto ilustrativa de ${esc(p.name)}">

    <p class="hint">${esc(p.description)}</p>

    ${
      canCustomize
        ? `
      <label class="block-label">Adicionais (opcionais)</label>
      <div id="extraList">
        ${extras()
          .map(
            (x) => `
          <div class="extra-row">
            <label>
              <input type="checkbox" value="${x.id}"
                ${chosen.has(x.id) ? "checked" : ""}>
              <span>${esc(x.name)}</span>
            </label>
            <b>+ ${fmt(x.price)}</b>
          </div>
        `,
          )
          .join("")}
      </div>
    `
        : ""
    }

    <label class="block-label" for="itemObservation">
      Observações deste lanche
    </label>

    <textarea id="itemObservation" class="field" maxlength="250"
      placeholder="Ex.: sem tomate, tirar milho, sem maionese...">${esc(original?.observation || "")}</textarea>

    <div class="qty">
      <span>Quantidade</span>
      <div>
        <button id="minusQty">−</button>
        <strong id="qtyDisplay">${qty}</strong>
        <button id="plusQty">+</button>
      </div>
    </div>

    <div class="modal-total">
      <span>Total do item</span>
      <b id="itemTotal"></b>
    </div>

    <button class="primary" id="addItem">
      ${editIndex === null ? "Adicionar à sacola" : "Salvar alterações"}
    </button>
  `,
  );

  const update = () => {
    chosen = new Set(
      [...$("modalBody").querySelectorAll("#extraList input:checked")].map(
        (x) => Number(x.value),
      ),
    );

    const extraValue = extras()
      .filter((x) => chosen.has(x.id))
      .reduce((s, x) => s + x.price, 0);

    $("qtyDisplay").textContent = qty;
    $("itemTotal").textContent = fmt((p.price + extraValue) * qty);
  };

  $("modalBody")
    .querySelectorAll("#extraList input")
    .forEach((el) => {
      el.onchange = update;
    });

  $("minusQty").onclick = () => {
    qty = Math.max(1, qty - 1);
    update();
  };

  $("plusQty").onclick = () => {
    qty = Math.min(30, qty + 1);
    update();
  };

  $("addItem").onclick = () => {
    const extraIds = [...chosen].sort((a, b) => a - b);
    const observation = $("itemObservation").value.trim();

    const unit =
      p.price +
      extras()
        .filter((x) => chosen.has(x.id))
        .reduce((s, x) => s + x.price, 0);

    const entry = {
      productId: p.id,
      name: p.name,
      quantity: qty,
      extraIds,
      observation,
      unit,
    };

    if (editIndex === null) {
      cart.push(entry);
    } else {
      cart[editIndex] = entry;
    }

    renderCart();
    closeModal();
  };

  update();
}

// CARRINHO
function renderCart() {
  $("cartItems").innerHTML = cart.length
    ? cart
        .map(
          (item, i) => `
      <div class="cart-row">
        <div class="line">
          <b>${item.quantity}x ${esc(item.name)}</b>
          <b>${fmt(item.quantity * item.unit)}</b>
        </div>

        ${
          item.extraIds.length
            ? `
          <small>+ ${esc(
            item.extraIds.map((id) => productById(id)?.name || "").join(", "),
          )}</small>
        `
            : ""
        }

        ${
          item.observation
            ? `
          <small>Obs.: ${esc(item.observation)}</small>
        `
            : ""
        }

        <div class="actions">
          <button data-edit="${i}">Editar</button>
          <button data-remove="${i}">Remover</button>
        </div>
      </div>
    `,
        )
        .join("")
    : '<p class="empty">Sua sacola está vazia. Escolha seu lanche!</p>';

  $("cartItems")
    .querySelectorAll("[data-edit]")
    .forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.edit);
        openProduct(cart[i].productId, i);
      };
    });

  $("cartItems")
    .querySelectorAll("[data-remove]")
    .forEach((b) => {
      b.onclick = () => {
        cart.splice(Number(b.dataset.remove), 1);
        renderCart();
      };
    });

  const f = fee();

  $("totals").innerHTML = `
    <div class="total-line">
      <span>Subtotal</span>
      <span>${fmt(subtotal())}</span>
    </div>
    <div class="total-line">
      <span>Entrega</span>
      <span>${f === null ? "A definir" : fmt(f)}</span>
    </div>
    <div class="total-line final">
      <span>Total</span>
      <span>${
        f === null ? fmt(subtotal()) + " + entrega" : fmt(subtotal() + f)
      }</span>
    </div>
  `;

  const qty = cart.reduce((s, i) => s + i.quantity, 0);

  $("cartCount").textContent = qty + " itens";
  $("mobileCount").textContent = qty;
  $("mobileTotal").textContent = fmt(subtotal());
  if ($("mobileBag")) renderMobileBag();
  $("mobileCartBtn").setAttribute("aria-label", `Ver sacola com ${qty} itens, subtotal ${fmt(subtotal())}`);
  $("deliveryLabel").textContent = bairro
    ? `${bairro} · ${fmt(fee())}`
    : "Calcular taxa de entrega";
}

$("search").oninput = render;

$("clearBtn").onclick = () => {
  if (!cart.length) return notify("Sua sacola já está vazia.");
  confirmCard("Deseja remover todos os produtos da sacola?", () => {
    cart = [];
    renderCart();
    notify("Sacola limpa com sucesso.", "success");
  });
};

$("deliveryBtn").onclick = openDelivery;
$("checkoutBtn").onclick = openCheckout;

// SACOLA MOBILE — mesmo conteúdo e cálculos do carrinho desktop
function renderMobileBag() {
  const target = $("mobileBag");
  if (!target) return;
  const f = fee();
  const qty = cart.reduce((sum, item) => sum + item.quantity, 0);
  target.innerHTML = `
    <button type="button" class="delivery-link mobile-delivery" id="mobileDeliveryBtn">
      <span>⌖ &nbsp; ${esc(bairro ? bairro + " · " + (f === null ? "A definir" : fmt(f)) : "Calcular taxa de entrega")}</span><b>›</b>
    </button>
    <div class="cart-title mobile-bag-title">
      <h2>Sua sacola <small>${qty} ${qty === 1 ? "item" : "itens"}</small></h2>
      <button type="button" id="mobileClearBtn">Limpar</button>
    </div>
    <div class="cart-items mobile-bag-items">
      ${cart.length ? cart.map((item, i) => `
        <div class="cart-row">
          <div class="line"><b>${item.quantity}x ${esc(item.name)}</b><b>${fmt(item.quantity * item.unit)}</b></div>
          ${item.extraIds.length ? `<small>+ ${esc(item.extraIds.map(id => productById(id)?.name || "").join(", "))}</small>` : ""}
          ${item.observation ? `<small>Obs.: ${esc(item.observation)}</small>` : ""}
          <div class="actions"><button type="button" data-mobile-edit="${i}">Editar</button><button type="button" data-mobile-remove="${i}">Remover</button></div>
        </div>`).join("") : `<p class="empty">Sua sacola está vazia. Escolha seu lanche!</p>`}
    </div>
    <div class="totals mobile-bag-totals">
      <div class="total-line"><span>Subtotal</span><span>${fmt(subtotal())}</span></div>
      <div class="total-line"><span>Entrega</span><span>${f === null ? "A definir" : fmt(f)}</span></div>
      <div class="total-line final"><span>Total</span><span>${f === null ? fmt(subtotal()) + " + entrega" : fmt(subtotal() + f)}</span></div>
    </div>
    <div class="mobile-bag-footer"><button type="button" class="primary" id="mobileCheckout" ${cart.length ? "" : "disabled"}>Continuar pedido</button></div>
  `;
  $("mobileDeliveryBtn").onclick = openDelivery;
  $("mobileClearBtn").onclick = () => {
    if (!cart.length) return notify("Sua sacola já está vazia.");
    confirmCard("Deseja remover todos os produtos da sacola?", () => {
      cart = [];
      renderCart();
      notify("Sacola limpa com sucesso.", "success");
    });
  };
  target.querySelectorAll("[data-mobile-edit]").forEach(button => {
    button.onclick = () => {
      const item = cart[Number(button.dataset.mobileEdit)];
      if (item) openProduct(item.productId, Number(button.dataset.mobileEdit));
    };
  });
  target.querySelectorAll("[data-mobile-remove]").forEach(button => {
    button.onclick = () => {
      cart.splice(Number(button.dataset.mobileRemove), 1);
      renderCart();
    };
  });
  $("mobileCheckout").onclick = openCheckout;
}

$("mobileCartBtn").onclick = () => {
  modal("Sua sacola", `<div id="mobileBag" class="mobile-bag"></div>`);
  $("overlay").classList.add("mobile-bag-open");
  renderMobileBag();
};

// ENTREGA
function deliverySuggestions(fieldId, targetId) {
  const q = norm($(fieldId).value);
  const results = q
    ? fees.filter((x) => norm(x.name).includes(q)).slice(0, 10)
    : [];

  $(targetId).innerHTML = results
    .map(
      (x) => `
    <button data-neighborhood="${esc(x.name)}">
      ${esc(x.name)} · ${fmt(x.fee)}
    </button>
  `,
    )
    .join("");

  $(targetId)
    .querySelectorAll("button")
    .forEach((b) => {
      b.onclick = () => {
        $(fieldId).value = b.dataset.neighborhood;
        $(targetId).innerHTML = "";
      };
    });
}

function openDelivery() {
  modal(
    "Calcular taxa de entrega",
    `
    <p class="hint">
      Digite o bairro. Ex.: Cecap, Centro, Nova Lorena.
    </p>
    <label class="block-label">Bairro</label>
    <input id="deliveryInput" class="field"
      value="${esc(bairro)}" autocomplete="off"
      placeholder="Comece a digitar">
    <div class="suggestions" id="deliveryMatches"></div>
    <button class="primary" style="margin-top:16px"
      id="saveNeighborhood">Confirmar bairro</button>
  `,
  );

  $("deliveryInput").oninput = () =>
    deliverySuggestions("deliveryInput", "deliveryMatches");

  $("saveNeighborhood").onclick = () => {
    const chosen = fees.find(
      (x) => norm(x.name) === norm($("deliveryInput").value),
    );

    if (!chosen) return notify("Escolha um bairro sugerido.");

    bairro = chosen.name;
    renderCart();
    closeModal();
  };
}

// MÁSCARA DE WHATSAPP
function maskPhone(value) {
  const d = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 11);
  if (d.length <= 2) return d.length ? "(" + d : "";

  const prefix = "(" + d.slice(0, 2) + ") ";

  if (d.length <= 6) return prefix + d.slice(2);
  if (d.length <= 10) {
    return prefix + d.slice(2, 6) + "-" + d.slice(6);
  }

  return prefix + d.slice(2, 7) + "-" + d.slice(7);
}

// CHECKOUT
function openCheckout() {
  if (!storeIsOpen) return notify("A loja está fechada no momento.");
  if (!cart.length) return notify("Escolha pelo menos um lanche.");

  modal(
    "Finalizar pedido",
    `
    <form id="orderForm">
      <div class="form-grid">
        <div>
          <label class="block-label">Nome e sobrenome</label>
          <input class="field" id="customerName" required maxlength="100"
            autocomplete="name">
        </div>
        <div>
          <label class="block-label">WhatsApp</label>
          <input class="field" id="phone" required inputmode="tel"
            maxlength="15" placeholder="(12) 99999-9999">
        </div>
      </div>

      <label class="block-label">Como vai receber?</label>
      <div class="delivery-options">
        <button type="button" id="deliveryOption">Entrega</button>
        <button type="button" id="pickupOption">Retirada</button>
      </div>

      <div id="addressFields">
        <label class="block-label">Bairro</label>
        <input class="field" id="district"
          value="${esc(bairro)}" autocomplete="off"
          placeholder="Digite seu bairro">
        <div class="suggestions" id="districtMatches"></div>

        <label class="block-label">Rua, número e referência</label>
        <input class="field" id="address" maxlength="250"
          placeholder="Rua, número e complemento">
      </div>

      <label class="block-label">Pagamento</label>
      <select class="field" id="payment">
        <option value="cartao_entrega">Cartão na entrega/retirada</option>
        <option value="dinheiro">Dinheiro na entrega/retirada</option>
        <option value="pix_online" disabled>Pix online — em breve</option>
      </select>

      <div id="changeBox" hidden>
        <label class="block-label">Troco para quanto? (opcional)</label>
        <input class="field" id="changeFor" type="number"
          min="0" step="0.01" placeholder="Ex.: 50.00">
      </div>

      <p class="warning">
        Pix online será liberado quando a integração bancária estiver pronta.
      </p>

      <p class="hint">
        As observações de cada lanche são informadas ao selecionar o produto.
      </p>

      <button class="primary" id="submitOrder" type="submit">
        Confirmar pedido
      </button>
    </form>
  `,
  );

  const setMode = (mode) => {
    delivery = mode;
    $("deliveryOption").classList.toggle("active", mode === "delivery");
    $("pickupOption").classList.toggle("active", mode === "pickup");
    $("addressFields").hidden = mode === "pickup";
    $("district").required = mode === "delivery";
    $("address").required = mode === "delivery";
  };

  $("deliveryOption").onclick = () => setMode("delivery");
  $("pickupOption").onclick = () => setMode("pickup");

  setMode(delivery);

  $("phone").oninput = (e) => {
    e.target.value = maskPhone(e.target.value);
  };

  $("district").oninput = () =>
    deliverySuggestions("district", "districtMatches");

  $("payment").onchange = () => {
    $("changeBox").hidden = $("payment").value !== "dinheiro";
  };

  $("orderForm").onsubmit = sendOrder;
}

// ENVIAR PEDIDO
async function sendOrder(e) {
  e.preventDefault();

  if (!online) {
    return notify("Servidor indisponível. Verifique sua conexão e tente novamente.", "error");
  }

  const chosen = fees.find((x) => norm(x.name) === norm($("district").value));

  if (delivery === "delivery" && !chosen) {
    return notify("Selecione um bairro válido.");
  }

  const btn = $("submitOrder");
  btn.disabled = true;
  btn.textContent = "Enviando pedido...";

  const change =
    $("payment").value === "dinheiro" && $("changeFor").value
      ? Number($("changeFor").value)
      : null;

  const body = {
    customerName: $("customerName").value,
    phone: $("phone").value,
    fulfillment: delivery,
    neighborhood: delivery === "delivery" ? chosen.name : "",
    address: delivery === "delivery" ? $("address").value : "",
    paymentMethod: $("payment").value,
    changeFor: change,
    items: cart.map((x) => ({
      productId: x.productId,
      quantity: x.quantity,
      extraIds: x.extraIds,
      observation: x.observation,
    })),
  };

  try {
    const r = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const result = await r.json();

    if (!r.ok) {
      throw Error(result.error || "Falha no pedido.");
    }

    tracking = result.trackingToken;
    localStorage.setItem("cardoso_tracking", tracking);
    saveOwnedOrder(tracking);
    localStorage.setItem("cardoso_order_id", String(result.orderId));

    cart = [];
    renderCart();
    openOrders(true);
  } catch (err) {
    notify(err.message, "error");
    btn.disabled = false;
    btn.textContent = "Confirmar pedido";
  }
}

// ACOMPANHAMENTO DE PEDIDOS
const statuses = [
  "recebido",
  "confirmado",
  "preparando",
  "pronto",
  "saiu_entrega",
  "entregue",
];

const labels = [
  "Pedido recebido",
  "Confirmado pela lanchonete",
  "Em preparo",
  "Pronto",
  "Saiu para entrega",
  "Entregue",
];

// Cada navegador guarda somente os códigos privados dos pedidos feitos nele.
const ownedOrdersKey = "cardoso_owned_orders_v1";
function ownedOrderTokens() {
  let tokens = [];
  try { tokens = JSON.parse(localStorage.getItem(ownedOrdersKey) || "[]"); } catch {}
  if (!Array.isArray(tokens)) tokens = [];
  if (tracking) tokens.unshift(tracking); // Compatibilidade com pedido antigo salvo
  return [...new Set(tokens.filter(t => /^[a-f0-9]{48}$/.test(t)))].slice(0, 100);
}
function saveOwnedOrder(token) {
  if (!/^[a-f0-9]{48}$/.test(token)) return;
  localStorage.setItem(ownedOrdersKey, JSON.stringify([token, ...ownedOrderTokens()].slice(0,100)));
}
let ordersTab = "ativos";
function openOrders(justPlaced = false) {
  ordersTab = "ativos";
  modal("Meus pedidos", `
    <p class="hint">${justPlaced ? "Pedido registrado! Acompanhe seu andamento aqui." : "Acompanhe seus pedidos ativos e seu histórico neste aparelho."}</p>
    <div class="my-orders-tabs" role="tablist" aria-label="Filtrar meus pedidos">
      <button type="button" id="myActiveTab" class="selected" role="tab">Ativos</button>
      <button type="button" id="myHistoryTab" role="tab">Histórico</button>
    </div>
    <div id="myOrdersList" aria-live="polite">Carregando pedidos...</div>
    <details class="lookup-details"><summary>Consultar com código privado</summary>
      <label class="block-label" for="trackingInput">Código de acompanhamento</label>
      <input class="field" id="trackingInput" placeholder="Cole seu código privado">
      <button class="primary" id="trackButton" type="button" style="margin-top:10px">Consultar pedido</button>
    </details>
    <div id="trackingView" hidden></div>
  `);
  $("myActiveTab").onclick = () => { ordersTab = "ativos"; renderOwnedOrders(); };
  $("myHistoryTab").onclick = () => { ordersTab = "historico"; renderOwnedOrders(); };
  $("trackButton").onclick = () => {
    const value = $("trackingInput").value.replace(/\s|-/g, "").toLowerCase();
    if (!/^[a-f0-9]{48}$/.test(value)) return notify("Código privado inválido.");
    tracking = value;
    localStorage.setItem("cardoso_tracking", value);
    saveOwnedOrder(value);
    if (socket?.connected) socket.emit("join-tracking", value);
    renderOwnedOrders();
  };
  renderOwnedOrders();
}
async function renderOwnedOrders() {
  const list = $("myOrdersList");
  if (!list) return;
  $("myActiveTab")?.classList.toggle("selected", ordersTab === "ativos");
  $("myHistoryTab")?.classList.toggle("selected", ordersTab === "historico");
  list.innerHTML = '<p class="hint">Atualizando seus pedidos...</p>';
  const tokens = ownedOrderTokens();
  const entries = await Promise.all(tokens.map(async token => {
    try {
      const response = await fetch('/api/track/' + encodeURIComponent(token), {cache:'no-store'});
      if (!response.ok) return null;
      return {token, order: await response.json()};
    } catch { return null; }
  }));
  if (!list.isConnected) return;
  const finished = new Set(['entregue','cancelado']);
  const filtered = entries.filter(Boolean).filter(({order}) => ordersTab === 'historico' ? finished.has(order.status) : !finished.has(order.status));
  filtered.sort((a,b) => (b.order.orderId || 0) - (a.order.orderId || 0));
  list.innerHTML = filtered.length ? filtered.map(({token,order}) => {
    const label = order.status === 'cancelado' ? 'Cancelado' : (labels[statuses.indexOf(order.status)] || order.status);
    const phoneSuffix = order.phoneLast4 ? ` · Final ${esc(order.phoneLast4)}` : '';
    return `<article class="owned-order-card">
      <div class="owned-order-heading"><strong>Pedido #${esc(order.dailyNumber ?? order.orderId)}${phoneSuffix}</strong><span>${fmt(order.total)}</span></div>
      <p class="hint">${esc(label)}${order.createdAt ? ' · ' + esc(new Date(order.createdAt.replace(' ','T')+'Z').toLocaleDateString('pt-BR')) : ''}</p>
      <button type="button" class="owned-open" data-token="${esc(token)}">Ver detalhes e acompanhar</button>
    </article>`;
  }).join('') : `<p class="hint">${ordersTab === 'historico' ? 'Nenhum pedido finalizado neste aparelho.' : 'Nenhum pedido ativo neste aparelho.'}</p>`;
  list.querySelectorAll('[data-token]').forEach(button => button.onclick = () => {
    tracking = button.dataset.token;
    localStorage.setItem('cardoso_tracking', tracking);
    saveOwnedOrder(tracking);
    if (socket?.connected) socket.emit('join-tracking', tracking);
    const target = $("trackingView");
    target.hidden = false;
    loadTracking();
    target.scrollIntoView({behavior:'smooth',block:'nearest'});
  });
}

async function copyTracking() {
  try {
    await navigator.clipboard.writeText(tracking);
    notify("Código copiado!", "success");
  } catch {
    const input = $("trackingCode");
    if (input) {
      input.focus();
      input.select();
      notify("Selecione e copie o código.");
    }
  }
}

async function loadTracking() {
  const target = $("trackingView");
  if (!target) return;

  if (!tracking) {
    target.innerHTML =
      "<p class='hint'>Nenhum pedido salvo neste aparelho.</p>";
    return;
  }

  try {
    const response = await fetch("/api/track/" + encodeURIComponent(tracking));

    if (!response.ok) throw Error("Pedido não encontrado.");

    const order = await response.json();
    const at = statuses.indexOf(order.status);

    target.innerHTML = `
      <div class="cart-row">
        <b>Pedido #${esc(order.dailyNumber ?? order.orderId)}</b>
        <p>Total: ${fmt(order.total)}</p>
        <p>Status: <strong>${esc(labels[at] || order.status)}</strong></p>

        <label class="block-label" for="trackingCode">
          Seu código privado de acompanhamento
        </label>

        <input class="field tracking-code" id="trackingCode"
          readonly value="${esc(tracking)}">

        <button class="primary" id="copyTrackingCode">
          Copiar código
        </button>

        <p class="hint">
          Guarde este código. Não compartilhe publicamente.
        </p>

        ${['recebido','confirmado'].includes(order.status)
          ? `<div class="cancel-order-card"><strong>Precisa cancelar?</strong>
               <p class="hint">Você pode cancelar enquanto o preparo não começou.</p>
               <button type="button" class="cancel-order-btn" id="cancelOrderBtn">Cancelar pedido</button>
             </div>` : ''}
        ${order.status === 'cancelado' ? `<p class="hint">Este pedido foi cancelado.</p>` : ''}
        ${order.fulfillment === "delivery" && order.status === "saiu_entrega"
          ? `<div class="delivery-confirm-card" style="margin:16px 0;padding:16px;border:1px solid #f39a40;border-radius:12px;background:#24211d">
               <strong>Seu pedido chegou?</strong>
               <p class="hint">Confirme somente depois de receber seu pedido.</p>
               <button type="button" class="primary" id="confirmDeliveryBtn">✓ Confirmar recebimento</button>
             </div>`
          : ""}
        ${order.status === "entregue"
          ? `<p class="hint" style="color:#7bd89b;font-weight:700">✓ Recebimento confirmado. Obrigado pela preferência!</p>`
          : ""}

        ${statuses
          .map(
            (s, i) => `
          <div class="track-step ${i <= at ? "done" : ""}">
            ${esc(labels[i])}
          </div>
        `,
          )
          .join("")}
      </div>
    `;

    const cancelButton = $("cancelOrderBtn");
    if (cancelButton) cancelButton.onclick = () => confirmCard(
      "Deseja realmente cancelar este pedido? Esta ação não pode ser desfeita.",
      () => cancelarPedido(tracking)
    );
    $("copyTrackingCode").onclick = copyTracking;
    const confirmButton = $("confirmDeliveryBtn");
    if (confirmButton) {
      confirmButton.onclick = () => confirmCard(
        "Você recebeu seu pedido? Confirme apenas se a entrega realmente aconteceu.",
        () => confirmarRecebimento(tracking)
      );
    }
  } catch (err) {
    target.innerHTML = `<p class="warning">${esc(err.message)}</p>`;
  }
}

// CANCELAMENTO DE PEDIDO PELO CLIENTE
async function cancelarPedido(token) {
  const button = $("cancelOrderBtn");
  if (button) { button.disabled = true; button.textContent = "Cancelando..."; }
  try {
    const response = await fetch('/api/track/' + encodeURIComponent(token) + '/cancel', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível cancelar.');
    notify('Pedido cancelado com sucesso.', 'success');
    if (tracking === token) {
      await loadTracking();
      await renderOwnedOrders();
    }
  } catch (error) {
    notify(error.message || 'Falha ao cancelar pedido.', 'error');
    if (button?.isConnected) { button.disabled = false; button.textContent = 'Cancelar pedido'; }
  }
}

// CONFIRMAÇÃO DE ENTREGA PELO CLIENTE
async function confirmarRecebimento(token) {
  const botao = $("confirmDeliveryBtn");
  if (botao) {
    botao.disabled = true;
    botao.textContent = "Confirmando...";
  }
  try {
    const response = await fetch(
      "/api/track/" + encodeURIComponent(token) + "/confirm-delivery",
      { method: "POST" }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível confirmar.");
    notify("Recebimento confirmado! Obrigado pela preferência.", "success");
    if (tracking === token) { await loadTracking(); await renderOwnedOrders(); }
  } catch (error) {
    notify(error.message || "Falha ao confirmar entrega.", "error");
    if (botao?.isConnected) {
      botao.disabled = false;
      botao.textContent = "✓ Confirmar recebimento";
    }
  }
}

// INICIALIZAÇÃO
$("homeBtn").onclick = () => {
  closeModal();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

$("ordersBtn").onclick = () => openOrders();

async function init() {
  try {
    const r = await fetch("/api/catalog");

    if (!r.ok) throw Error("Servidor indisponível");

    const data = await r.json();

    products = data.products;
    fees = data.neighborhoods;
    storeIsOpen = data.store?.open !== false;
    updateStoreBanner();
    online = true;
  } catch {
    $("products").innerHTML = `
      <p class="warning">
        Não foi possível carregar o catálogo.
        Inicie o servidor com npm start.
      </p>
    `;
    return;
  }

  render();

  if (window.io) {
    socket = io();
    socket.on("store:updated", (state) => { storeIsOpen = state.open; updateStoreBanner(); });
    socket.on("catalog:updated", () => window.location.reload());

    socket.on("connect", () => {
      if (tracking) socket.emit("join-tracking", tracking);
    });

    socket.on("order-updated", () => {
      if (
        !$("overlay").hidden &&
        $("modalTitle").textContent === "Meus pedidos"
      ) {
        renderOwnedOrders();
        if (!$("trackingView")) return;
        if (!$("trackingView").hidden) loadTracking();
      }
    });
  }
}

init();

function updateStoreBanner(){
 let banner=document.getElementById('storeBanner');
 if(!banner){banner=document.createElement('div');banner.id='storeBanner';banner.className='store-banner';document.querySelector('.intro')?.before(banner);}
 banner.hidden=storeIsOpen;
 banner.textContent=storeIsOpen?'':'Estamos fechados no momento. Você pode consultar o cardápio, mas não finalizar pedidos.';
 const checkout=document.getElementById('checkoutBtn');if(checkout)checkout.disabled=!storeIsOpen;
}
