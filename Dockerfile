FROM node:18.12.1-alpine

RUN apk update && apk --no-cache add git

RUN mkdir /app
WORKDIR /app

RUN apk --no-cache add bash

COPY package.json yarn.lock /app/
RUN \
  yarn --frozen-lockfile && \
  yarn cache clean

ENV PATH="/app/node_modules/.bin:${PATH}"

COPY . /app/

CMD yarn test
