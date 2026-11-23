# Backend + SQL — Studio Alison Aguiar

Substitui `server.js`, `package.json` e `.env.example` do repositório. A pasta `public/` (HTML/CSS/JS) **não foi alterada**; a API mantém o mesmo contrato.

## Rodar
```
npm install
cp .env.example .env     # defina ADMIN_PASSWORD
npm start
```
Site: http://localhost:3000 · Painel: http://localhost:3000/admin.html

O banco `data/barbearia.sqlite` é criado a partir de `db/schema.sql` na primeira execução.

## Tabelas
`services`, `settings`, `closed_dates`, `appointments`, `appointment_services`.

## Correções em relação à versão original
- `UNIQUE(date, time, status)` impedia cancelar dois agendamentos do mesmo horário; agora é um índice único parcial (só vale para agendamentos não cancelados).
- Serviços combinados bloqueiam a duração total (ex.: corte + barba = 60 min), sem sobreposição.
- Reserva feita dentro de uma transação imediata (sem corrida entre dois clientes).
- Serviços e preços vêm do banco; o preço fica congelado no agendamento.
- Senha admin comparada em tempo constante + limite de tentativas; cabeçalhos básicos de segurança.
- Corrigido o regex `\\D` em `/api/settings/public`.
- Removida do `.env.example` a senha real; o painel exige `ADMIN_PASSWORD`.

## Observações
- Pix continua em modo demonstração (sem cobrança real).
- `/api/slots` aceita `?serviceIds=a,b` opcional; o front atual não o envia, então usa 30 min até ele passar a enviar. Para o cálculo por duração total valer no site, o `app.js` precisaria enviar esse parâmetro (você pediu para não mexer no front).
