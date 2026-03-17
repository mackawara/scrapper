# Stop and remove the existing container if running
stop:
	docker stop scrapper || true
	docker rm scrapper || true

# Remove the existing image
clean:
	docker rmi scrapper || true

# Build the Docker image with no cache
build: stop
	docker buildx build --platform linux/amd64  --load -t scrapper .

# Build the Docker image with no cache
build-no-cache: stop clean
	docker buildx build --platform linux/amd64  --load --no-cache -t scrapper .

# Run the container, ensuring the correct port and env file
run: stop
	docker run --rm --name scrapper -p 4000:4000 --env-file .env scrapper

# Run the container interactively for debugging
run-it: stop
	docker run --rm -it scrapper sh
prune : stop 
	docker system prune -a

push:
	docker tag scrapper mackawara/scrapper:latest
	docker push mackawara/scrapper:latest
