
// Simple ECMAScript6's find method implementation.

if (!Array.prototype.find) {
    Array.prototype.find = function(callback, thisArg) {
        var array = this;

        if (typeof(array.length) === 'undefined')
            throw new Error('array.length is undefined');

        if (array.length === 0)
            return;

        for (var i = 0; i < array.length; i++) {
            var element = array[i];

            var isMatching = false;
            if (typeof(thisArg) !== 'undefined')
                isMatching = callback.call(thisArg, element, i, array);
            else
                isMatching = callback(element, i, array);

            if (isMatching)
                return element;
        }
    }
}