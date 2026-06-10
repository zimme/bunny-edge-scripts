declare module "@bunny.net/edgescript-sdk" {
  export const net: {
    http: {
      serve(
        handler: (request: Request) => Response | Promise<Response>,
      ): void;
    };
  };
}
