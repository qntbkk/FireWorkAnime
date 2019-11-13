define([], function () {
    return {
        _execMf: function (mf, guid, cb) {
            if (mf && guid) {
                mx.ui.action(mf, {
                    params: {
                        applyto: "selection",
                        guids: [guid]
                    },
                    callback: cb && cb(),
                    error: function (error) {
                        console.debug(error.description);
                    }
                }, this);
            }
        },
    }
})