FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

RUN npm install

COPY . .

# Flag bypass frontend saat build (Vite membaca VITE_* dari environment).
# Railway otomatis meng-oper service variables sebagai build args,
# jadi nilai ini bisa dioverride dari dashboard Railway.
ARG VITE_BYPASS_TIME_CHECK=true
ARG VITE_BYPASS_PAGI_ONLY=false
ENV VITE_BYPASS_TIME_CHECK=$VITE_BYPASS_TIME_CHECK
ENV VITE_BYPASS_PAGI_ONLY=$VITE_BYPASS_PAGI_ONLY

RUN npm run build

EXPOSE 5000

CMD ["npm", "start"]