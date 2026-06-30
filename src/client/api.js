'use strict';
(function installNv142ClientApi(){ window.NV142Api = { request:(route, options)=>window.api ? window.api(route, options) : Promise.reject(new Error('api unavailable')) }; })();
