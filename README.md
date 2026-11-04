# Mapa de Câmeras 3D

Painel de gestão de câmeras de segurança sobre um globo 3D ([CesiumJS](https://cesium.com/platform/cesiumjs/)): posição, direção e área coberta por cada câmera, status, ficha técnica, cobertura de áreas e pontos cegos.

O front-end são três arquivos estáticos (`index.html`, `style.css`, `app.js`), sem build; as bibliotecas vêm de CDN. As câmeras ficam num banco Neon, acessado por funções da Vercel em `api/`, com login restrito: e-mails em `ALLOWED_EMAILS` editam; e-mails em `VIEWER_EMAILS` só consultam (separe por vírgula).

## Funcionalidades

- Globo 3D com imagem de satélite ou mapa escuro
- Cones de visão 3D (azimute, inclinação, campo de visão e alcance) e pegada no solo
- Status online, alerta, offline e planejada, com disponibilidade em %
- Agrupamento automático das câmeras próximas, colorido pelo pior status
- Ficha técnica em painel lateral recolhível (o mapa encolhe em vez de ficar coberto), "ver do ponto de vista da câmera" e link para o Google Earth
- Cadastro e edição no mapa: arraste a câmera para posicioná-la e o ponto azul para girar e definir o alcance, com o cone atualizando ao vivo
- Importação de planilha (.xlsx, .xls ou .csv) com prévia do que muda, atualizando por ID ou substituindo tudo, e exportação para Excel e KML
- Menu **Camadas** com cones, relevo, mapa base e mancha de cobertura
- Busca de endereço no mapa (OpenStreetMap/Nominatim, pelo servidor e só com login)
- Áreas de interesse com % de cobertura e mancha de pontos cegos
- Simulação de câmeras planejadas antes da instalação
- Relevo real, prédios do OpenStreetMap e cidades fotorrealistas do Google (com token Cesium ion)
- Relatório para imprimir ou salvar em PDF

## Como usar

Abra o painel no navegador. Ele começa com câmeras de exemplo na região da Av. Paulista (dados fictícios).

Para usar as suas câmeras, clique em **Dados → Escolher planilha**. O arquivo [`exemplo-cameras.csv`](exemplo-cameras.csv) mostra o formato. Só **Latitude** e **Longitude** são obrigatórias.

| Coluna | Significado |
|---|---|
| Altura | metros acima do solo |
| Azimute | direção em graus (0 = norte, 90 = leste) |
| Inclinação | graus abaixo do horizonte |
| FOV | ângulo de visão horizontal, em graus |
| Alcance | metros |
| Status | Online, Alerta, Offline ou Planejada |
| Stream | link do vídeo ao vivo (http/https) |

Os dados cadastrados ficam salvos no navegador de quem usa (localStorage). Use **Dados → Planilha Excel** para fazer backup ou levar para outro computador.

## Relevo e prédios 3D

Os modos **Terreno + prédios** e **Google 3D** precisam de um token gratuito do [Cesium ion](https://ion.cesium.com/tokens). Para o Google 3D, adicione também o asset *Google Photorealistic 3D Tiles* em Asset Depot.

O token é colado no próprio painel (botão **Token Cesium**). Com login ele fica no banco (tabela `app_state`) e vale para todos os usuários; não vai para o código. Só editores o alteram, mas quem faz login o recebe no navegador, como todo token do Cesium ion. Como o site é público, restrinja o token ao domínio do GitHub Pages nas configurações do token (*Allowed URLs*).

## Publicar no GitHub Pages

1. **Settings → Pages**
2. Em *Source*, escolha **Deploy from a branch**
3. Selecione a branch `main` e a pasta `/ (root)` e clique em **Save**
4. Em 1–2 minutos o painel fica em `https://SEU-USUARIO.github.io/mapa-cameras-3d/`

## Tecnologias

- [CesiumJS 1.123](https://cesium.com/platform/cesiumjs/): globo 3D
- [SheetJS 0.20.3](https://sheetjs.com/): leitura e escrita de planilhas (arquivo local em `vendor/`, com hash de integridade)
- Imagens de satélite: Esri World Imagery. Mapa: OpenStreetMap / CARTO

## Backup

Uma função agendada (`/api/backup`, todo dia às 07:00 UTC) copia câmeras, áreas e histórico para a tabela `backups` e guarda os 14 mais recentes. Banco vazio não gera backup. Para restaurar, veja `sql/restore-backup.sql`. O Neon gratuito também guarda 6 horas de histórico (Backup & Restore no console).
