# Cardoso Burguer House — versão 1

Os arquivos estão todos na mesma pasta. O site inteiro está no `index.html` (HTML, CSS e JS juntos). O backend está em `server.js`. O banco `cardoso.sqlite` é criado automaticamente.

## Rodar no Windows

Instale o Node.js LTS (versão 20 ou superior). Abra PowerShell na pasta dos arquivos:

```powershell
npm install
npm start
```

Abra **http://localhost:3000**.

Pode abrir `index.html` com duplo clique para visualizar o design, pesquisar e montar o carrinho; enviar pedidos reais exige o servidor rodando.

## Observações importantes

- **Versão inicial:** o site usa emojis temporários nos cards enquanto não forem recebidas fotos originais dos lanches e a logo isolada.
- Os preços e taxas são uma transcrição inicial das imagens fornecidas. Confirme todos os preços antes de publicar.
- Pagamento online **não está integrado**. Apenas formas de pagamento na entrega são permitidas.
- Os adicionais aparecem como itens individuais nesta primeira versão; seleção de adicionais por lanche fica para uma próxima melhoria.
- Os novos pedidos são gravados no SQLite; o backend emite evento `new-order` por Socket.IO. O app Flutter e a autenticação da equipe ainda serão desenvolvidos.
- Não exponha este projeto publicamente em produção sem antes implementar autenticação administrativa, proteção contra abuso, HTTPS, backup, observabilidade e política de privacidade.
- SQLite requer hospedagem com disco persistente; plataformas efêmeras podem apagar o banco. Faça cópias regulares do arquivo do banco.
