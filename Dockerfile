# Use Node.js LTS version
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Bundle app source
COPY . .

# Set environment variables
ENV NODE_ENV=production

# Expose the port - Railway will set the actual PORT at runtime
EXPOSE 3000

# Start the Express application
CMD ["node", "app.js"] 