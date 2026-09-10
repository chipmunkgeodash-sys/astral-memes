/* global Ultraviolet */
self.__uv$config = {
  prefix: "/proxy/ddg-v3/",
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: "/proxy/uv/uv.handler.js",
  client: "/proxy/uv/uv.client.js",
  bundle: "/proxy/uv/uv.bundle.js",
  config: "/proxy/uv-ddg-v3.config.js",
  sw: "/proxy/uv/uv.sw.js",
};
