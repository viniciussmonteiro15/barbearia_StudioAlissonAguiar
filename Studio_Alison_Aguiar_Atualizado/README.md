# Studio Alison Aguiar

Sistema de agendamento para barbearia, com site público em formato de conversa, painel administrativo e API Node.js + Express integrada ao MySQL.

## Requisitos

- Node.js 18 ou superior
- MySQL 8 ou compatível
- npm

## Configuração

1. Crie o banco e as tabelas executando o arquivo `db/schema.sql` no MySQL Workbench ou pelo terminal.
2. Copie `.env.example` para `.env`.
3. Preencha os dados de conexão do MySQL e defina uma senha forte em `ADMIN_PASSWORD`.
4. Instale as dependências e inicie o servidor:

```bash
npm install
npm start
```

Para desenvolvimento com reinicialização automática:

```bash
npm run dev
```

A aplicação ficará disponível em `http://localhost:3000` e o painel administrativo em `http://localhost:3000/admin.html`.

## Variáveis de ambiente

| Variável | Finalidade |
|---|---|
| `PORT` | Porta HTTP da aplicação (padrão: 3000) |
| `ADMIN_PASSWORD` | Senha de acesso ao painel administrativo |
| `DB_HOST` | Endereço do servidor MySQL |
| `DB_PORT` | Porta MySQL (padrão: 3306) |
| `DB_USER` | Usuário MySQL |
| `DB_PASSWORD` | Senha MySQL |
| `DB_NAME` | Nome do banco (padrão: `studio_alison_aguiar`) |
| `BARBERSHOP_NAME` | Nome público do estabelecimento |
| `BARBERSHOP_PHONE` | Telefone público, com DDD |
| `PIX_MODE` | Modo da demonstração Pix |
| `TZ` | Fuso horário (padrão recomendado: `America/Sao_Paulo`) |

## Funcionalidades

- Agendamento de serviços pelo site público.
- Consulta de horários disponíveis considerando a duração total dos serviços selecionados.
- Painel protegido por senha administrativa.
- Listagem de agendamentos com filtro por data.
- Abas separadas para agendamentos em andamento e registros concluídos/cancelados.
- Confirmação antes de concluir, cancelar ou reabrir um agendamento.
- Reabertura de registros encerrados, com retorno automático à aba de itens em andamento.
- Atualização do status de pagamento.
- Configuração dos dias e horários de funcionamento e das datas fechadas.
- Menu administrativo adaptado para desktop e dispositivos móveis.

## Observações

- O backend deste pacote utiliza MySQL. Os arquivos SQLite antigos não são necessários para executar esta versão.
- O Pix permanece em modo de demonstração: não há cobrança nem confirmação automática de pagamento.
- A senha administrativa não deve ser publicada nem enviada ao repositório. Mantenha o arquivo `.env` fora do Git.
