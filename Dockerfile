FROM node:0.10-slim
ADD . /app
WORKDIR /app
RUN npm install

EXPOSE 3000

ENTRYPOINT ["node"]
CMD ["app.js", "-p", "3000"]
