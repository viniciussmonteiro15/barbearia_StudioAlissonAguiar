/* =========================================================
   1. FUNÇÕES AUXILIARES E VARIÁVEIS GLOBAIS
   ========================================================= */

// Busca um elemento HTML pelo seu ID.
const $ = (id) => document.getElementById(id);

// A senha NUNCA fica escrita no código (este arquivo é público).
// Ela é digitada no login e conferida pelo servidor (ADMIN_PASSWORD no .env).
let password = "";

// Formata um número como moeda brasileira. Ex.: 40 -> R$ 40,00.
const money = (value) =>
    Number(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });

// Escapa caracteres especiais para evitar inserção insegura de HTML.
const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);

// 2026-11-30 -> 30/11/2026
const formatDate = (iso) => {
    const [y, m, d] = String(iso).slice(0, 10).split("-");
    return y && m && d ? `${d}/${m}/${y}` : iso;
};

// 11999998888 -> (11) 99999-8888
const formatPhone = (raw) => {
    const n = String(raw || "").replace(/\D/g, "");
    if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
    if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return raw;
};

// Mostra uma mensagem em um elemento, se ele existir.
const setText = (id, text) => {
    const el = $(id);
    if (el) el.textContent = text;
};


/* =========================================================
   2. COMUNICAÇÃO COM A API
   ========================================================= */

/**
 * Envia requisições HTTP para o servidor.
 * Recebe a URL e opções (método, corpo etc.), envia a senha
 * administrativa no cabeçalho e trata a resposta JSON/erros.
 */
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
        throw new Error("Não foi possível conectar ao servidor. Ele está ligado?");
    }

    // Converte a resposta para JSON; usa mensagem padrão se falhar.
    const data = await response
        .json()
        .catch(() => ({ error: "Resposta inválida do servidor" }));

    // Interrompe a execução quando a API retorna erro HTTP.
    if (!response.ok) {
        throw new Error(data.error || "Erro na requisição");
    }

    return data;
}


/* =========================================================
   3. LOGIN DO ADMINISTRADOR
   ========================================================= */

async function doLogin() {
    const button = $("login");
    password = $("password").value;
    setText("loginError", "");

    if (!password) {
        setText("loginError", "Digite a senha.");
        return;
    }

    button.disabled = true;

    try {
        // A tentativa de carregar os agendamentos valida a senha.
        await loadAppointments();

        // Esconde o formulário de login e mostra o painel.
        $("loginPanel").classList.add("hidden");
        $("dashboard").classList.remove("hidden");

        // Carrega as configurações atuais do estabelecimento.
        await loadSettings();
    } catch (error) {
        password = "";
        setText("loginError", error.message);
    } finally {
        button.disabled = false;
    }
}

// Ao clicar em entrar (ou apertar Enter), verifica o acesso e abre o painel.
$("login").addEventListener("click", doLogin);
$("password").addEventListener("keydown", (event) => {
    if (event.key === "Enter") doLogin();
});

// Sair: apaga a senha da memória e volta para a tela de login.
$("logout").addEventListener("click", () => {
    password = "";
    $("password").value = "";
    $("appointments").innerHTML = "";
    $("dashboard").classList.add("hidden");
    $("loginPanel").classList.remove("hidden");
});


/* =========================================================
   4. CARREGAMENTO E EXIBIÇÃO DOS AGENDAMENTOS
   ========================================================= */

// Traduz os status internos para textos em português.
const statusLabels = {
    booked: "Agendado",
    cancelled: "Cancelado",
    completed: "Concluído"
};

/** Monta o cartão HTML de um agendamento. */
function appointmentCard(appointment) {
    const isPaid = appointment.paymentStatus === "paid";
    const paymentMethod = appointment.paymentMethod === "pix"
        ? "Pix escolhido"
        : "Presencial";

    // Define o status que será aplicado ao clicar no botão de pagamento.
    const nextPaymentStatus = isPaid ? "pending" : "paid";
    const paymentButtonText = isPaid ? "Marcar pendente" : "Marcar pago";

    const services = (appointment.services || [])
        .map((service) => esc(service.name))
        .join(", ");

    const id = esc(appointment.id);

    // Botões de status mudam conforme a situação atual do agendamento.
    const statusButtons = appointment.status === "booked"
        ? `
            <button type="button" class="button secondary" data-status="completed" data-id="${id}">Marcar concluído</button>
            <button type="button" class="button secondary" data-status="cancelled" data-id="${id}">Cancelar</button>`
        : `
            <button type="button" class="button secondary" data-status="booked" data-id="${id}">Reabrir</button>`;

    return `
        <article class="appointment-card status-${esc(appointment.status)}">
            <div class="appointment-head">
                <strong>${esc(appointment.name)}</strong>
                <strong>${money(appointment.total)}</strong>
            </div>

            <p class="appointment-when">
                <strong>${esc(formatDate(appointment.date))} às ${esc(appointment.time)}</strong>
                · ${esc(formatPhone(appointment.phone))}
            </p>

            <p class="appointment-services">${services}</p>

            <p class="appointment-badges">
                <span class="badge badge-${esc(appointment.status)}">
                    ${esc(statusLabels[appointment.status] || appointment.status)}
                </span>
                <span class="badge ${isPaid ? "badge-paid" : "badge-pending"}">
                    ${isPaid ? "Pago" : "Pendente"} · ${paymentMethod}
                </span>
            </p>

            <div class="button-row">
                ${statusButtons}
                <button type="button" class="button primary" data-paid="${nextPaymentStatus}" data-id="${id}">
                    ${paymentButtonText}
                </button>
            </div>
        </article>
    `;
}

/** Busca os agendamentos (opcionalmente filtrados por data)
 * e cria os cartões que serão exibidos no painel.
 */
async function loadAppointments() {
    const date = $("filterDate").value;

    // Adiciona o filtro de data à URL quando ele foi preenchido.
    const url = "/api/admin/appointments" +
        (date ? "?date=" + encodeURIComponent(date) : "");

    const data = await api(url);
    const appointments = data.appointments || [];

    $("appointments").innerHTML = appointments.length
        ? appointments.map(appointmentCard).join("")
        : "<p class=\"empty\">Nenhum agendamento encontrado.</p>";

    // Limpa mensagens de erro anteriores.
    setText("adminError", "");
}

// Um único ouvinte cuida de todos os botões dos cartões (mesmo após recarregar a lista).
$("appointments").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-id]");
    if (!button) return;

    if (button.dataset.status) {
        updateAppointment(button.dataset.id, { status: button.dataset.status });
    } else if (button.dataset.paid) {
        updateAppointment(button.dataset.id, { paymentStatus: button.dataset.paid });
    }
});


/* =========================================================
   5. ATUALIZAÇÃO DE UM AGENDAMENTO
   ========================================================= */

/**
 * Atualiza um agendamento específico.
 * id: identificador do agendamento.
 * body: objeto com os campos que serão alterados.
 */
async function updateAppointment(id, body) {
    try {
        await api(`/api/admin/appointments/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: JSON.stringify(body)
        });

        // Atualiza a lista para exibir os dados mais recentes.
        await loadAppointments();
    } catch (error) {
        setText("adminError", error.message);
    }
}


/* =========================================================
   6. EVENTOS DOS BOTÕES DE FILTRO
   ========================================================= */

// Carrega os agendamentos da data selecionada.
$("loadAppointments").addEventListener("click", () => {
    loadAppointments().catch((error) => setText("adminError", error.message));
});

// Limpa a data selecionada e carrega todos os agendamentos.
$("showAll").addEventListener("click", () => {
    $("filterDate").value = "";
    loadAppointments().catch((error) => setText("adminError", error.message));
});


/* =========================================================
   7. CARREGAMENTO DAS CONFIGURAÇÕES DE FUNCIONAMENTO
   ========================================================= */

/** Busca as configurações no servidor e preenche os campos
 * de dias, horários, duração dos intervalos e datas fechadas.
 */
async function loadSettings() {
    const settings = await api("/api/admin/settings");

    // Marca os dias da semana em que o estabelecimento funciona.
    document.querySelectorAll("#days input").forEach((input) => {
        input.checked = (settings.openDays || []).includes(Number(input.value));
    });

    // Preenche os horários de abertura e fechamento.
    $("openTime").value = settings.openTime;
    $("closeTime").value = settings.closeTime;

    // Define a duração de cada horário; cria a opção se ela ainda não existir.
    const slot = String(settings.slotMinutes || 30);
    const select = $("slotMinutes");
    if (![...select.options].some((option) => option.value === slot)) {
        select.add(new Option(`${slot} minutos`, slot));
    }
    select.value = slot;

    // Exibe as datas em que o estabelecimento estará fechado.
    $("closedDates").value = (settings.closedDates || []).join(", ");
}


/* =========================================================
   8. SALVAMENTO DAS CONFIGURAÇÕES
   ========================================================= */

// Salva as configurações quando o administrador clica no botão.
$("saveSettings").addEventListener("click", async () => {
    const message = $("settingsMessage");
    message.classList.remove("error", "success");

    try {
        // Organiza os valores preenchidos em um objeto.
        const body = {
            // Obtém os dias da semana selecionados e converte para número.
            openDays: [...document.querySelectorAll("#days input:checked")]
                .map((input) => Number(input.value)),

            // Obtém os horários de funcionamento.
            openTime: $("openTime").value,
            closeTime: $("closeTime").value,

            // Converte a duração dos intervalos para número.
            slotMinutes: Number($("slotMinutes").value),

            // Separa as datas por vírgula, remove espaços e itens vazios.
            closedDates: $("closedDates").value
                .split(",")
                .map((date) => date.trim())
                .filter(Boolean)
        };

        // Envia as novas configurações para a API usando PUT.
        await api("/api/admin/settings", {
            method: "PUT",
            body: JSON.stringify(body)
        });

        message.classList.add("success");
        message.textContent = "Funcionamento salvo com sucesso.";
    } catch (error) {
        message.classList.add("error");
        message.textContent = error.message;
    }
});

// Ano no rodapé.
if ($("year")) $("year").textContent = new Date().getFullYear();
