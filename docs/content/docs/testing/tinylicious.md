---
title: Tinylicious
menuPosition: 1
editor: sdeshpande3
---

## What is Tinylicious?

**Tinylicious** is a local, in-memory Fluid service intended for prototyping and development purpose. The [TinyliciousClient]({{< relref "tinyliciousclient.md" >}}) is designed to work specifically with the Tinylicious service.

## Using Tinylicious locally

You can run `Tinylicious` locally by executing the following command:

  ```sh
  npx tinylicious@latest
  ```

By default, Tinylicious runs on port 7070. You can change port by setting the `PORT` environment variable when running Tinylicious. Setting environment variables will vary based on the shell you are using. For example, the Windows PowerShell commands below will run Tinylicious on port 6502.

  ```sh
  $env:PORT=6502
  npx tinylicious@latest
  ```

Now Tinylicious is listening on port 6502.

## How to deploy using Tinylicious

`TinyliciousClient` provides the ability to have a Fluid object backed by a `Tinylicious` service. Check out [FluidHelloWorld]({{< relref "tutorial.md" >}}) example for setting up the tinylicious client and server.

1. Run `Tinylicious` by running the following command,

  ```sh
  npx tinylicious@latest
  ```

3. Run `TinyliciousClient` by running the following command,

  ```sh
  npm run start:client
  ```

##  Testing with Tinylicious and multiple clients

When testing, it can be useful to make Tinylicious available outside localhost. You can use a service like [ngrok](https://ngrok.com/) to expose the Tinylicious port on your local machine to the internet. ngrok gives you a random hostname for each tunnel you create and routes requests to your locally-running Tinylicious service.

To use Tinylicious with ngrok, use the following steps. If you do not have an ngrok account, you can sign up at <https://ngrok.com/>.

1. Sign in to the ngrok dashboard and click "Your Authtoken". You will need this token to authenticate with ngrok.

2. [Download ngrok](https://ngrok.com/download) and unzip the file.

3. Connect to your account by running the following command.

  ```sh
  ngrok authtoken <YOUR NGROK AUTHTOKEN>
  ```

Running this command will add your authtoken to the default ngrok.yml configuration file.

4. Run Tinylicious service locally

  ```sh
  npx tinylicious@latest
  ```

5. Start ngrok and point it to the Tinylicious port. By default, Tinylicious is running on port 7070, so the `PORT_NUMBER` in the below command would be 7070. If you are running against a non-default port, the `PORT_NUMBER` would vary.

  ```sh
  ngrok http PORT_NUMBER
  ```

After completing the final step, you will see the *Forwarding URL* in your terminal, which can be used to access Tinylicious. By default, ngrok assumes that your local server is just serving http and goes ahead and provides you with a URL that supports both HTTP and HTTPS tunneling through to your local server.

If your ngrok account includes the capability to set custom domains or subdomains, you can use the following command to use a custom domain instead of a randomly-generated one.

  ```sh
  ngrok http -hostname CUSTOM_DOMAIN_NAME PORT_NUMBER
  ```
