Backend README

1) Instalação
   cd backend
   npm install

2) Variáveis de ambiente
   Copie .env.example para .env e ajuste VERIFY_TOKEN e PORT se necessário.

3) Iniciar
   npm run dev    (requer nodemon)
   ou
   npm start

4) Testes locais
   Use ngrok para expor https e configurar webhook no Facebook Developer:
   ngrok http 3001
