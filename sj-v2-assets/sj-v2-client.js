(function () {
  if (self.top === self && self.location.pathname.startsWith("/sj/")) {
    self.location.replace("/site.html");
    return;
  }

  const scramjet = self.$scramjet;
  const bridge = self.__scramjetV2;

  if (!scramjet || !bridge || self.__scramjetV2ClientLoaded) return;
  self.__scramjetV2ClientLoaded = true;

  const context = bridge.createContext();

  function hookSubcontext(target) {
    const client = new scramjet.ScramjetClient(target, {
      context,
      transport: bridge.createTransport(),
      sendSetCookie: async () => {},
      hookSubcontext,
      initHeaders: [],
      history: [],
    });
    client.hook();
    return client;
  }

  hookSubcontext(self);
})();
