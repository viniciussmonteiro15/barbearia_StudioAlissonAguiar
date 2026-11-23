/* =========================================================
   PAINEL ADMINISTRATIVO — STUDIO ALISON AGUIAR
   ========================================================= */

const $ = (id) => document.getElementById(id);
let password = "";
let appointmentsCache = [];
let currentTab = "active";
let confirmationAction = null;

const money = (value) => Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
});

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[character]);

const formatDate = (iso) => {
    const [year, month, day] = String(iso).slice(0, 10).split("-");
    return year && month && day ? `${day}/${month}/${year}` : iso;
};

const formatPhone = (raw) => {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return raw;
};

const setText = (id, text) => {
    const element = $(id);
    if (element) element.textContent = text;
};

function showFeedback(message, type = "success") {
    const element = $("adminFeedback");
    if (!element) return;
    element.className = `feedback ${type}`;
    element.textContent = message;
}

function clearFeedback() {
    setText("adminError", "");
    showFeedback("");
}

/* -------------------- Comunicação com a API -------------------- */
async function api(url, options = {}) {
    let response;
    try {
        response = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                "x-admin-password": password,
                ...(options.headers || {})
            }
        });
    } catch {
        throw new Error("Não foi possível conectar ao servidor. Verifique se ele está ligado.");
    }

    const data = await response.json().catch(() => ({ error: "Resposta inválida do servidor." }));
    if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
    return data;
}

/* -------------------- Confirmações acessíveis -------------------- */
function openConfirmation({ title, message, details = "", confirmText = "Confirmar", danger = false, action }) {
    confirmationAction = action;
    setText("confirmTitle", title);
    setText("confirmMessage", message);
    setText("confirmDetails", details);

    const confirmButton = $("acceptConfirm");
    confirmButton.textContent = confirmText;
    confirmButton.classList.toggle("danger", danger);
    confirmButton.classList.toggle("primary", !danger);
    confirmButton.disabled = false;

    $("confirmDialog").showModal();
}

$("cancelConfirm").addEventListener("click", () => {
    confirmationAction = null;
    $("confirmDialog").close();
});

$("acceptConfirm").addEventListener("click", async () => {
    if (typeof confirmationAction !== "function") return;
    const button = $("acceptConfirm");
    button.disabled = true;
    button.textContent = "Processando...";

    const action = confirmationAction;
    confirmationAction = null;
    try {
        await action();
    } finally {
        $("confirmDialog").close();
        button.disabled = false;
    }
});

$("confirmDialog").addEventListener("close", () => {
    confirmationAction = null;
});

/* -------------------- Menu responsivo -------------------- */
const menuToggle = $("menuToggle");
const adminNavLinks = $("adminNavLinks");

menuToggle.addEventListener("click", () => {
    const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isExpanded));
    menuToggle.setAttribute("aria-label", isExpanded ? "Abrir menu" : "Fechar menu");
    adminNavLinks.classList.toggle("is-open", !isExpanded);
});

adminNavLinks.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
        adminNavLinks.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Abrir menu");
    }
});

/* -------------------- Login e sessão -------------------- */
async function doLogin() {
    const button = $("login");
    password = $("password").value;
    setText("loginError", "");

    if (!password) {
        setText("loginError", "Digite a senha para acessar o painel.");
        $("password").focus();
        return;
    }

    button.disabled = true;
    button.textContent = "Entrando...";
    try {
        // Valida a senha primeiro. Depois carrega as configurações sem duplicar
        // tentativas de autenticação em caso de senha incorreta.
        await loadAppointments();
        await loadSettings();
        $("loginPanel").classList.add("hidden");
        $("dashboard").classList.remove("hidden");
        clearFeedback();
    } catch (error) {
        password = "";
        setText("loginError", error.message);
    } finally {
        button.disabled = false;
        button.textContent = "Entrar";
    }
}

$("login").addEventListener("click", doLogin);
$("password").addEventListener("keydown", (event) => {
    if (event.key === "Enter") doLogin();
});

$("logout").addEventListener("click", () => {
    password = "";
    appointmentsCache = [];
    $("password").value = "";
    $("appointments").innerHTML = "";
    $("dashboard").classList.add("hidden");
    $("loginPanel").classList.remove("hidden");
    setText("loginError", "");
    setText("activeCount", "0");
    setText("closedCount", "0");
});

/* -------------------- Abas e cartões de agendamento -------------------- */
const statusLabels = {
    booked: "Agendado",
    cancelled: "Cancelado",
    completed: "Concluído"
};

function appointmentCard(appointment) {
    const isPaid = appointment.paymentStatus === "paid";
    const paymentMethod = appointment.paymentMethod === "pix" ? "Pix escolhido" : "Presencial";
    const nextPaymentStatus = isPaid ? "pending" : "paid";
    const paymentButtonText = isPaid ? "Marcar pendente" : "Marcar pago";
    const services = (appointment.services || []).map((service) => esc(service.name)).join(", ");
    const id = esc(appointment.id);
    const isActive = appointment.status === "booked";

    const statusButtons = isActive
        ? `
            <button type="button" class="button secondary" data-status="completed" data-id="${id}">Concluir atendimento</button>
            <button type="button" class="button danger-outline" data-status="cancelled" data-id="${id}">Cancelar</button>`
        : `
            <button type="button" class="button secondary" data-status="booked" data-id="${id}">Reabrir agendamento</button>`;

    return `
        <article class="appointment-card status-${esc(appointment.status)}">
            <div class="appointment-head">
                <strong>${esc(appointment.name)}</strong>
                <strong class="appointment-total">${money(appointment.total)}</strong>
            </div>
            <p class="appointment-when">
                <strong>${esc(formatDate(appointment.date))} às ${esc(appointment.time)}</strong>
                <span aria-hidden="true">·</span> ${esc(formatPhone(appointment.phone))}
            </p>
            <p class="appointment-services">${services}</p>
            <p class="appointment-badges">
                <span class="badge badge-${esc(appointment.status)}">${esc(statusLabels[appointment.status] || appointment.status)}</span>
                <span class="badge ${isPaid ? "badge-paid" : "badge-pending"}">${isPaid ? "Pago" : "Pendente"} · ${paymentMethod}</span>
            </p>
            <div class="button-row">
                ${statusButtons}
                <button type="button" class="button primary" data-paid="${nextPaymentStatus}" data-id="${id}">${paymentButtonText}</button>
            </div>
        </article>
    `;
}

function renderAppointments() {
    const active = appointmentsCache.filter((item) => item.status === "booked");
    const closed = appointmentsCache.filter((item) => item.status === "completed" || item.status === "cancelled");

    setText("activeCount", active.length);
    setText("closedCount", closed.length);

    const showingActive = currentTab === "active";
    const visible = showingActive ? active : closed;
    const tab = showingActive ? "activeTab" : "closedTab";
    $("activeTab").classList.toggle("is-active", showingActive);
    $("closedTab").classList.toggle("is-active", !showingActive);
    $("activeTab").setAttribute("aria-selected", String(showingActive));
    $("closedTab").setAttribute("aria-selected", String(!showingActive));
    $("appointments").setAttribute("aria-labelledby", tab);

    if (!visible.length) {
        const message = showingActive
            ? "Nenhum agendamento em andamento para este filtro."
            : "Nenhum agendamento concluído ou encerrado encontrado.";
        $("appointments").innerHTML = `<p class="empty">${message}</p>`;
        return;
    }

    $("appointments").innerHTML = visible.map(appointmentCard).join("");
}

async function loadAppointments() {
    const date = $("filterDate").value;
    const url = "/api/admin/appointments" + (date ? `?date=${encodeURIComponent(date)}` : "");
    const data = await api(url);
    appointmentsCache = data.appointments || [];
    renderAppointments();
    setText("adminError", "");
}

$("activeTab").addEventListener("click", () => {
    currentTab = "active";
    renderAppointments();
});

$("closedTab").addEventListener("click", () => {
    currentTab = "closed";
    renderAppointments();
});

// Delegação de eventos: os botões continuam funcionando após a atualização dos cartões.
$("appointments").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-id]");
    if (!button) return;

    const appointment = appointmentsCache.find((item) => String(item.id) === button.dataset.id);
    if (!appointment) return;

    if (button.dataset.status) {
        requestStatusChange(appointment, button.dataset.status);
    } else if (button.dataset.paid) {
        updateAppointment(button.dataset.id, { paymentStatus: button.dataset.paid });
    }
});

function requestStatusChange(appointment, nextStatus) {
    const name = appointment.name;
    const actions = {
        completed: {
            title: "Concluir atendimento",
            message: `Deseja realmente concluir o atendimento de ${name}?`,
            details: "O agendamento sairá da aba Em andamento e ficará disponível em Concluídos e encerrados. Você poderá reabri-lo depois.",
            confirmText: "Sim, concluir",
            danger: false
        },
        cancelled: {
            title: "Cancelar agendamento",
            message: `Tem certeza de que deseja cancelar o agendamento de ${name}?`,
            details: "O horário será liberado para novos agendamentos. O registro continuará disponível no histórico.",
            confirmText: "Sim, cancelar",
            danger: true
        },
        booked: {
            title: "Reabrir agendamento",
            message: `Deseja reabrir o agendamento de ${name}?`,
            details: "O registro voltará para a aba Em andamento e o horário ficará reservado novamente.",
            confirmText: "Sim, reabrir",
            danger: false
        }
    };

    const config = actions[nextStatus];
    if (!config) return;
    openConfirmation({
        ...config,
        action: () => updateAppointment(appointment.id, { status: nextStatus })
    });
}

async function updateAppointment(id, body) {
    try {
        await api(`/api/admin/appointments/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: JSON.stringify(body)
        });
        // Ao mudar de grupo, abrimos a aba de destino para o usuário ver o registro.
        if (body.status === "booked") currentTab = "active";
        if (body.status === "completed" || body.status === "cancelled") currentTab = "closed";
        await loadAppointments();
        showFeedback(body.status ? "Status do agendamento atualizado com sucesso." : "Pagamento atualizado com sucesso.");
    } catch (error) {
        setText("adminError", error.message);
        showFeedback("");
    }
}

/* -------------------- Filtros -------------------- */
$("loadAppointments").addEventListener("click", () => {
    loadAppointments().then(() => showFeedback("Filtro aplicado.")).catch((error) => setText("adminError", error.message));
});

$("showAll").addEventListener("click", () => {
    $("filterDate").value = "";
    loadAppointments().then(() => showFeedback("Exibindo todos os agendamentos.")).catch((error) => setText("adminError", error.message));
});

/* -------------------- Configurações de funcionamento -------------------- */
async function loadSettings() {
    const settings = await api("/api/admin/settings");
    document.querySelectorAll("#days input").forEach((input) => {
        input.checked = (settings.openDays || []).includes(Number(input.value));
    });

    $("openTime").value = settings.openTime;
    $("closeTime").value = settings.closeTime;

    const slot = String(settings.slotMinutes || 30);
    const select = $("slotMinutes");
    if (![...select.options].some((option) => option.value === slot)) {
        select.add(new Option(`${slot} minutos`, slot));
    }
    select.value = slot;
    $("closedDates").value = (settings.closedDates || []).join(", ");
}

$("saveSettings").addEventListener("click", async () => {
    const message = $("settingsMessage");
    message.classList.remove("error", "success");
    message.textContent = "";

    const body = {
        openDays: [...document.querySelectorAll("#days input:checked")].map((input) => Number(input.value)),
        openTime: $("openTime").value,
        closeTime: $("closeTime").value,
        slotMinutes: Number($("slotMinutes").value),
        closedDates: $("closedDates").value.split(",").map((date) => date.trim()).filter(Boolean)
    };

    const button = $("saveSettings");
    button.disabled = true;
    button.textContent = "Salvando...";
    try {
        await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(body) });
        message.classList.add("success");
        message.textContent = "Funcionamento salvo com sucesso.";
    } catch (error) {
        message.classList.add("error");
        message.textContent = error.message;
    } finally {
        button.disabled = false;
        button.textContent = "Salvar funcionamento";
    }
});

// Ano atualizado automaticamente no rodapé.
$("year").textContent = new Date().getFullYear();
