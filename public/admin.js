/* =========================================================
   1. FUNÇÕES AUXILIARES E VARIÁVEIS GLOBAIS
   ========================================================= */

// Busca um elemento HTML pelo seu ID.
const $ = (id) => document.getElementById(id);

// Armazena a senha usada para acessar o painel administrativo.
let password = "2026barbearia";

// Formata um número como moeda brasileira. Ex.: 40 -> R$ 40,00.
const money = (value) =>
    Number(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });

// Escapa caracteres especiais para evitar inserção insegura de HTML.
const esc = (value) =>
    String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);


/* =========================================================
   2. COMUNICAÇÃO COM A API
   ========================================================= */

/**
 * Envia requisições HTTP para o servidor.
 * Recebe a URL e opções (método, corpo etc.), envia a senha
 * administrativa no cabeçalho e trata a resposta JSON/erros.
 */
async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "x-admin-password": password,
            ...(options.headers || {})
        }
    });

    // Converte a resposta para JSON; usa mensagem padrão se falhar.
    const data = await response
        .json()
        .catch(() => ({ error: "Resposta inválida" }));

    // Interrompe a execução quando a API retorna erro HTTP.
    if (!response.ok) {
        throw new Error(data.error || "Erro na requisição");
    }

    return data;
}


/* =========================================================
   3. LOGIN DO ADMINISTRADOR
   ========================================================= */

// Ao clicar em entrar, verifica o acesso e abre o painel.
$("login").addEventListener("click", async () => {
    password = $("password").value;

    try {
        // A tentativa de carregar os agendamentos valida a senha.
        await loadAppointments();

        // Esconde o formulário de login e mostra o painel.
        $("loginPanel").classList.add("hidden");
        $("dashboard").classList.remove("hidden");

        // Carrega as configurações atuais do estabelecimento.
        await loadSettings();
    } catch (error) {
        // Exibe o erro de autenticação ou comunicação.
        $("loginError").textContent = error.message;
    }
});


/* =========================================================
   4. CARREGAMENTO E EXIBIÇÃO DOS AGENDAMENTOS
   ========================================================= */

/** Busca os agendamentos (opcionalmente filtrados por data)
 * e cria os cartões que serão exibidos no painel.
 */
async function loadAppointments() {
    const date = $("filterDate").value;

    // Adiciona o filtro de data à URL quando ele foi preenchido.
    const url = "/api/admin/appointments" +
        (date ? "?date=" + encodeURIComponent(date) : "");

    const data = await api(url);
    const appointments = data.appointments;

    // Traduz os status internos para textos em português.
    const statusLabels = {
        booked: "Agendado",
        cancelled: "Cancelado",
        completed: "Concluído"
    };

    // Monta um cartão HTML para cada agendamento.
    $("appointments").innerHTML = appointments.length
        ? appointments.map((appointment) => {
            const paymentMethod = appointment.paymentMethod === "pix"
                ? "Pix escolhido"
                : "Presencial";

            const paymentButtonText = appointment.paymentStatus === "paid"
                ? "Marcar pendente"
                : "Marcar pago";

            // Define o status que será aplicado ao clicar no botão.
            const nextPaymentStatus = appointment.paymentStatus === "paid"
                ? "pending"
                : "paid";

            return `
                <article class="appointment-card">
                    <div class="appointment-head">
                        <strong>${esc(appointment.name)}</strong>
                        <strong>${money(appointment.total)}</strong>
                    </div>

                    <p>
                        <strong>${esc(appointment.date)} às ${esc(appointment.time)}</strong>
                        · ${esc(appointment.phone)}
                    </p>

                    <p>
                        ${appointment.services
                            .map((service) => esc(service.name))
                            .join(", ")}
                    </p>

                    <p>
                        Status:
                        <strong>${esc(statusLabels[appointment.status] || appointment.status)}</strong>
                        · Pagamento:
                        ${appointment.paymentStatus === "paid" ? "Pago" : "Pendente"}
                        (${paymentMethod})
                    </p>

                    <div class="button-row">
                        <!-- Altera o status do atendimento para concluído. -->
                        <button
                            class="button secondary"
                            data-status="completed"
                            data-id="${esc(appointment.id)}">
                            Marcar concluído
                        </button>

                        <!-- Altera o status do atendimento para cancelado. -->
                        <button
                            class="button secondary"
                            data-status="cancelled"
                            data-id="${esc(appointment.id)}">
                            Cancelar
                        </button>

                        <!-- Alterna o pagamento entre pago e pendente. -->
                        <button
                            class="button primary"
                            data-paid="${nextPaymentStatus}"
                            data-id="${esc(appointment.id)}">
                            ${paymentButtonText}
                        </button>
                    </div>
                </article>
            `;
        }).join("")
        : "<p>Nenhum agendamento encontrado.</p>";

    // Configura os botões que alteram o status do agendamento.
    document.querySelectorAll("[data-status]").forEach((button) => {
        button.addEventListener("click", () => {
            updateAppointment(button.dataset.id, {
                status: button.dataset.status
            });
        });
    });

    // Configura os botões que alteram o status do pagamento.
    document.querySelectorAll("[data-paid]").forEach((button) => {
        button.addEventListener("click", () => {
            updateAppointment(button.dataset.id, {
                paymentStatus: button.dataset.paid
            });
        });
    });

    // Limpa mensagens de erro anteriores.
    $("adminError").textContent = "";
}


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
        await api(`/api/admin/appointments/${id}`, {
            method: "PATCH",
            body: JSON.stringify(body)
        });

        // Atualiza a lista para exibir os dados mais recentes.
        await loadAppointments();
    } catch (error) {
        $("adminError").textContent = error.message;
    }
}


/* =========================================================
   6. EVENTOS DOS BOTÕES DE FILTRO
   ========================================================= */

// Carrega os agendamentos da data selecionada.
$("loadAppointments").addEventListener("click", () => {
    loadAppointments().catch((error) => {
        $("adminError").textContent = error.message;
    });
});

// Limpa a data selecionada e carrega todos os agendamentos.
$("showAll").addEventListener("click", () => {
    $("filterDate").value = "";

    loadAppointments().catch((error) => {
        $("adminError").textContent = error.message;
    });
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
        input.checked = settings.openDays.includes(Number(input.value));
    });

    // Preenche os horários de abertura e fechamento.
    $("openTime").value = settings.openTime;
    $("closeTime").value = settings.closeTime;

    // Define a duração de cada horário de atendimento.
    $("slotMinutes").value = String(settings.slotMinutes);

    // Exibe as datas em que o estabelecimento estará fechado.
    $("closedDates").value = settings.closedDates.join(", ");
}


/* =========================================================
   8. SALVAMENTO DAS CONFIGURAÇÕES
   ========================================================= */

// Salva as configurações quando o administrador clica no botão.
$("saveSettings").addEventListener("click", async () => {
    try {
        // Organiza os valores preenchidos em um objeto.
        const body = {
            // Obtém os dias da semana selecionados e converte para número.
            openDays: [
                ...document.querySelectorAll("#days input:checked")
            ].map((input) => Number(input.value)),

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

        // Informa que as configurações foram salvas.
        $("settingsMessage").textContent =
            "Funcionamento salvo com sucesso.";
    } catch (error) {
        // Informa ao administrador caso o salvamento falhe.
        $("settingsMessage").textContent = error.message;
    }
});
