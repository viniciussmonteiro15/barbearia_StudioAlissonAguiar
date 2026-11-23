/* =====================================================
   CHAT DE AGENDAMENTO — STUDIO ALISON AGUIAR
   Este arquivo controla a conversa e integra com server.js.
   ===================================================== */

const $ = (id) => document.getElementById(id);
let services = [];
let booking = null;
let paymentMethod = "";

// Mostra o ano atual no rodapé.
$("year").textContent = new Date().getFullYear();

// Formata números como moeda brasileira.
const money = (value) => Number(value).toLocaleString("pt-BR", {
    style: "currency", currency: "BRL"
});

// Retorna a data atual no formato YYYY-MM-DD, sem problemas de fuso horário.
function today() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Faz requisições à API e apresenta mensagens de erro amigáveis.
async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({ error: "Resposta inválida do servidor." }));
    if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
    return data;
}

// Adiciona um balão de mensagem (bot ou cliente) ao histórico.
function addMessage(text, sender = "bot") {
    const article = document.createElement("article");
    article.className = `message ${sender}`;
    const paragraph = document.createElement("p");
    paragraph.textContent = text; // textContent evita interpretar texto como HTML.
    const time = document.createElement("span");
    time.className = "message-time";
    time.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    article.append(paragraph, time);
    $("chatMessages").appendChild(article);
    $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
}

// Simula o assistente digitando antes de enviar a mensagem.
function botMessage(text, delay = 450) {
    return new Promise((resolve) => {
        $("chatLoading").classList.remove("hidden");
        setTimeout(() => {
            $("chatLoading").classList.add("hidden");
            addMessage(text, "bot");
            resolve();
        }, delay);
    });
}

// Desenha um campo de resposta e botão de continuar.
function showInput({ label, placeholder, buttonText, type = "text", inputMode = "" }) {
    $("chatControls").innerHTML = `
        <label for="chatInput">${label}</label>
        <input id="chatInput" type="${type}" placeholder="${placeholder}" ${inputMode ? `inputmode="${inputMode}"` : ""} autocomplete="off" required>
        <button id="chatSubmit" class="chat-button primary" type="button">${buttonText}</button>`;
    $("chatInput").focus();
}

// 1) Inicia a conversa e pergunta o nome.
async function startChat() {
    await botMessage("Olá! Seja muito bem-vindo ao Studio Alison Aguiar! 💈");
    await botMessage("Vamos agendar seu atendimento. Como posso te chamar?");
    showInput({ label: "Seu nome completo", placeholder: "Digite seu nome e sobrenome", buttonText: "Continuar" });
    $("chatSubmit").addEventListener("click", askName);
}

// 2) Valida e guarda o nome informado.
async function askName() {
    const name = $("chatInput").value.trim();
    if (name.split(/\s+/).filter(Boolean).length < 2) {
        alert("Por favor, digite seu nome completo."); $("chatInput").focus(); return;
    }
    booking = { name, phone: "", date: "", time: "", serviceIds: [], total: 0 };
    addMessage(name, "user");
    $("chatControls").innerHTML = "";
    await botMessage(`Prazer em conhecer você, ${name}! 😊`);
    await botMessage("Agora informe seu número de celular com DDD.");
    showInput({ label: "Celular com DDD", placeholder: "(11) 99999-9999", buttonText: "Continuar", type: "tel", inputMode: "tel" });
    $("chatSubmit").addEventListener("click", askPhone);
}

// 3) Valida o telefone e busca procedimentos cadastrados no servidor.
async function askPhone() {
    const digits = $("chatInput").value.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 11) {
        alert("Digite um celular válido com DDD."); $("chatInput").focus(); return;
    }
    booking.phone = digits;
    addMessage($("chatInput").value.trim(), "user");
    $("chatControls").innerHTML = "";
    await botMessage("Perfeito! 📱 Agora vamos escolher os procedimentos.");
    await loadServices();
}

// 4) Exibe os serviços e seus preços vindos de /api/services.
async function loadServices() {
    try {
        services = await api("/api/services");
        if (!services.length) { await botMessage("Não há procedimentos cadastrados no momento."); return; }
        await botMessage("Você pode escolher um ou mais procedimentos. Confira os valores:");
        $("chatControls").innerHTML = `
            <div class="option-list">
                ${services.map(service => `
                    <label class="option-button">
                        <span><input class="service-check" type="checkbox" value="${service.id}"> <strong>${service.name}</strong></span>
                        <strong>${money(service.price)}</strong>
                    </label>`).join("")}
                <div class="summary-total"><span>Total</span><output id="chatTotal">${money(0)}</output></div>
                <button id="servicesContinue" class="chat-button primary" type="button">Continuar</button>
            </div>`;
        document.querySelectorAll(".service-check").forEach(input => input.addEventListener("change", updateTotal));
        $("servicesContinue").addEventListener("click", confirmServices);
    } catch (error) {
        await botMessage(`Não consegui carregar os procedimentos. ${error.message}`);
    }
}

// Recalcula o total dos serviços marcados.
function updateTotal() {
    const chosen = [...document.querySelectorAll(".service-check:checked")];
    const total = chosen.reduce((sum, input) => {
        const service = services.find(item => String(item.id) === input.value);
        return sum + Number(service?.price || 0);
    }, 0);
    $("chatTotal").textContent = money(total);
}

// 5) Guarda IDs dos procedimentos selecionados e pergunta a data.
async function confirmServices() {
    const chosen = [...document.querySelectorAll(".service-check:checked")];
    if (!chosen.length) { alert("Selecione pelo menos um procedimento."); return; }
    booking.serviceIds = chosen.map(input => input.value);
    booking.services = chosen.map(input => services.find(item => String(item.id) === input.value));
    booking.total = booking.services.reduce((sum, item) => sum + Number(item.price), 0);
    addMessage(`${booking.services.map(item => item.name).join(", ")}\nTotal: ${money(booking.total)}`, "user");
    $("chatControls").innerHTML = "";
    await botMessage(`Ótima escolha! O total ficou em ${money(booking.total)}.`);
    await botMessage("Qual dia deseja realizar seu atendimento?");
    showDatePicker();
}

// 6) Cria seletor de data, bloqueando dias anteriores a hoje.
function showDatePicker() {
    $("chatControls").innerHTML = `
        <label for="chatDate">Dia do atendimento</label>
        <input id="chatDate" type="date" min="${today()}" required>
        <button id="dateContinue" class="chat-button primary" type="button">Ver horários</button>`;
    $("dateContinue").addEventListener("click", loadAvailableSlots);
}

// 7) Consulta horários disponíveis para a data escolhida.
async function loadAvailableSlots() {
    const date = $("chatDate").value;
    if (!date) { alert("Selecione uma data."); return; }
    if (date < today()) { alert("Escolha uma data de hoje ou futura."); return; }
    booking.date = date;
    addMessage(new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR"), "user");
    $("chatControls").innerHTML = "";
    await botMessage("Vou verificar os horários disponíveis...");
    try {
        const data = await api(`/api/slots?date=${encodeURIComponent(date)}`);
        if (!data.slots.length) {
            await botMessage("Não há horários disponíveis nesse dia. Vamos escolher outra data?");
            showDatePicker(); return;
        }
        await botMessage("Encontrei estes horários. Qual prefere?");
        $("chatControls").innerHTML = `
            <label for="chatTime">Horário disponível</label>
            <select id="chatTime"><option value="">Selecione um horário</option>
                ${data.slots.map(time => `<option value="${time}">${time}</option>`).join("")}
            </select>
            <button id="timeContinue" class="chat-button primary" type="button">Confirmar horário</button>`;
        $("timeContinue").addEventListener("click", confirmTime);
    } catch (error) {
        await botMessage(`Não consegui carregar os horários. ${error.message}`);
        showDatePicker();
    }
}

// 8) Confirma horário e mostra resumo do agendamento.
async function confirmTime() {
    const time = $("chatTime").value;
    if (!time) { alert("Escolha um horário."); return; }
    booking.time = time;
    addMessage(time, "user");
    $("chatControls").innerHTML = "";
    await botMessage("Horário anotado! 🕒");
    showBookingSummary();
}

// 9) Apresenta resumo e opções de pagamento.
async function showBookingSummary() {
    const date = new Date(`${booking.date}T12:00:00`).toLocaleDateString("pt-BR");
    addMessage(`Confira seu agendamento:\n\nNome: ${booking.name}\nCelular: ${booking.phone}\nData: ${date}\nHorário: ${booking.time}\nProcedimentos: ${booking.services.map(item => item.name).join(", ")}\nTotal: ${money(booking.total)}`, "bot");
    await botMessage("Como deseja pagar?");
    $("chatControls").innerHTML = `
        <div class="option-list">
            <button class="option-button" id="payPix" type="button"><strong>Pagar agora</strong><span>Pix</span></button>
            <button class="option-button" id="payLater" type="button"><strong>Pagar depois</strong><span>Presencial</span></button>
        </div>`;
    $("payPix").addEventListener("click", () => choosePayment("pix"));
    $("payLater").addEventListener("click", () => choosePayment("later"));
}

// 10) Registra a escolha e mostra aviso de Pix demonstrativo ou pagamento presencial.
async function choosePayment(method) {
    paymentMethod = method;
    addMessage(method === "pix" ? "Quero pagar agora com Pix." : "Prefiro pagar depois, presencialmente.", "user");
    $("chatControls").innerHTML = "";
    if (method === "pix") {
        await botMessage("Certo! O Pix abaixo está em modo de demonstração. Não é uma cobrança real.");
        showPixDemo();
    } else {
        await botMessage("Tudo bem! Você poderá pagar diretamente na barbearia.");
        await saveAppointment();
    }
}

// 11) Gera QR Code demonstrativo. Para cobrança real, integre um provedor Pix.
function showPixDemo() {
    $("chatControls").innerHTML = `
        <div class="pix-card">
            <div class="demo-warning">Pix demonstrativo: não transfira dinheiro. Configure uma chave real para receber pagamentos.</div>
            <h3>Pagamento via Pix</h3><p>Valor: <strong>${money(booking.total)}</strong></p>
            <div id="pixQrCode"></div>
            <p class="pix-key">Chave demonstrativa:<br>studioalisonaguiar@example.com</p>
            <button id="copyPix" class="chat-button secondary" type="button">Copiar chave</button>
            <button id="confirmPix" class="chat-button primary" type="button">Continuar e registrar pedido</button>
        </div>`;
    if (typeof QRCode !== "undefined") {
        new QRCode($("pixQrCode"), { text: `PIX DEMONSTRATIVO | Valor ${booking.total}`, width: 180, height: 180 });
    }
    $("copyPix").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText("studioalisonaguiar@example.com"); $("copyPix").textContent = "Copiado!"; }
        catch { alert("Não foi possível copiar. Selecione e copie a chave manualmente."); }
    });
    $("confirmPix").addEventListener("click", async () => {
        await botMessage("Pedido recebido! O pagamento Pix precisa ser confirmado pelo barbeiro.");
        await saveAppointment();
    });
}

// 12) Envia os dados para o endpoint existente do server.js.
// IMPORTANTE: o backend espera serviceIds, não o array completo de serviços.
async function saveAppointment() {
    $("chatControls").innerHTML = "";
    await botMessage("Registrando seu agendamento. Só um instante...");
    try {
        await api("/api/appointments", {
            method: "POST",
            body: JSON.stringify({
                name: booking.name,
                phone: booking.phone,
                date: booking.date,
                time: booking.time,
                serviceIds: booking.serviceIds,
                paymentMethod
            })
        });
        await botMessage("Agendamento registrado com sucesso! 🎉");
        await botMessage(`Obrigado, ${booking.name}! Esperamos você no Studio Alison Aguiar. 💈`);
        $("chatControls").innerHTML = `
            <div class="success-message"><h3>Agendamento confirmado!</h3><p>Seu horário foi registrado.</p></div>
            <button id="restartChat" class="chat-button primary" type="button">Fazer novo agendamento</button>`;
        $("restartChat").addEventListener("click", () => {
            $("chatMessages").innerHTML = "";
            $("chatControls").innerHTML = "";
            booking = null; paymentMethod = "";
            startChat();
        });
    } catch (error) {
        await botMessage(`Não foi possível registrar: ${error.message}`);
        $("chatControls").innerHTML = `<button id="retrySave" class="chat-button primary" type="button">Tentar novamente</button>`;
        $("retrySave").addEventListener("click", saveAppointment);
    }
}

// Inicializa o chat assim que o script é carregado.
startChat();
