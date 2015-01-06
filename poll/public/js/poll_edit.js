
function PollEditUtil(runtime, element, pollType) {
    var self = this;


    // These URLs aren't validated in real time, so even if they don't exist for a type of block
    // we can create a reference to them.
    this.loadAnswers = runtime.handlerUrl(element, 'load_answers');
    this.loadQuestions = runtime.handlerUrl(element, 'load_questions');

    this.init = function () {
        // Set up the editing form for a Poll or Survey.
        var temp = $('#poll-form-component', element).html();
        self.answerTemplate = Handlebars.compile(temp);

        $(element).find('.cancel-button', element).bind('click', function() {
            runtime.notify('cancel', {});
        });
        var button_mapping = self.mappings[pollType]['buttons'];
        for (var key in button_mapping) {
            if (button_mapping.hasOwnProperty(key)) {
                $(key, element).click(
                    // The nature of the closure forces us to make a custom function here.
                    function (context_key) {
                        return function () {
                            // The degree of precision on date should be precise enough to avoid
                            // collisions in the real world.
                            var bottom = $(button_mapping[context_key]['bottomMarker']);
                            var new_item = $(self.answerTemplate(button_mapping[context_key]['itemList']));
                            bottom.before(new_item);
                            self.empowerDeletes(new_item);
                            self.empowerArrows(
                                new_item, button_mapping[context_key]['topMarker'],
                                button_mapping[context_key]['bottomMarker']
                            );
                            new_item.fadeOut(250).fadeIn(250);
                        }
                    }(key)
                )
            }
        }

        $(element).find('.save-button', element).bind('click', self.pollSubmitHandler);

        var mapping = self.mappings[pollType]['onLoad'];
        for (var task in mapping) {
            function load (taskItem){
                $(function ($) {
                    $.ajax({
                        type: "POST",
                        url: taskItem['url'],
                        data: JSON.stringify({}),
                        success: taskItem['function']
                    });
                });
            }
            load(mapping[task]);
        }
    };

    this.extend = function (obj1, obj2) {
        // Mimics similar extend functions, making obj1 contain obj2's properties.
        for (var attrname in obj2) {
            if (obj2.hasOwnProperty(attrname)) {
                obj1[attrname] = obj2[attrname]
            }
        }
        return obj1;
    };

    this.makeNew = function(extra){
        // Make a new empty line item, like a question or an answer.
        // 'extra' should contain 'image', a boolean value that determines whether
        // an image path field should be provided, and 'noun', which should be either
        // 'question' or 'answer' depending on what is needed.
        return self.extend({'key': new Date().getTime(), 'text': '', 'img': ''}, extra)
    };

    this.empowerDeletes = function (scope) {
        // Activates the delete buttons on rendered line items.
        $('.poll-delete-answer', scope).click(function () {
            $(this).parent().remove();
        });
    };

    this.empowerArrows = function(scope, topMarker, bottomMarker) {
        // Activates the arrows on rendered line items.
        $('.poll-move-up', scope).click(function () {
            var tag = $(this).parents('li');
            if (tag.index() <= ($(topMarker).index() + 1)){
                return;
            }
            tag.prev().before(tag);
            tag.fadeOut("fast", "swing").fadeIn("fast", "swing");
        });
        $('.poll-move-down', scope).click(function () {
            var tag = $(this).parents('li');
            if ((tag.index() >= ($(bottomMarker).index() - 1))) {
                return;
            }
            tag.next().after(tag);
            tag.fadeOut("fast", "swing").fadeIn("fast", "swing");
        });
    };

    this.displayAnswers = function (data){
        self.displayItems(data, '#poll-answer-marker', '#poll-answer-end-marker')
    };

    this.displayQuestions = function (data) {
        self.displayItems(data, "#poll-question-marker", '#poll-question-end-marker')
    };

    // This object is used to swap out values which differ between Survey and Poll blocks.
    this.mappings = {
        'poll': {
            'buttons': {
                '#poll-add-answer': {
                    'itemList': {'items': [self.makeNew({'image': true, 'noun': 'answer'})]},
                    'topMarker': '#poll-answer-marker', 'bottomMarker': '#poll-answer-end-marker'
                }
            },
            'onLoad': [{'url': self.loadAnswers, 'function': self.displayAnswers}],
            'gather': [{'prefix': 'answer', 'field': 'answers'}]
        },
        'survey': {
            'buttons': {
                '#poll-add-answer': {
                    'itemList': {'items': [self.makeNew({'image': false, 'noun': 'answer'})]},
                    'topMarker': '#poll-answer-marker', 'bottomMarker': '#poll-answer-end-marker'
                },
                '#poll-add-question': {
                    'itemList': {'items': [self.makeNew({'image': true, 'noun': 'question'})]},
                    'topMarker': '#poll-question-marker', 'bottomMarker': '#poll-question-end-marker'
                }
            },
            'onLoad': [
                {'url': self.loadQuestions, 'function': self.displayQuestions},
                {'url': self.loadAnswers, 'function': self.displayAnswers}
            ],
            'gather': [{'prefix': 'answer', 'field': 'answers'}, {'prefix': 'question', 'field': 'questions'}]
        }
    };

    this.displayItems = function(data, topMarker, bottomMarker) {
        // Loads the initial set of items that the block needs to edit.
        $(bottomMarker).before(self.answerTemplate(data));
        self.empowerDeletes(element, topMarker, bottomMarker);
        self.empowerArrows(element, topMarker, bottomMarker);
    };

    this.check_return = function(data) {
        // Handle the return value JSON from the server.
        // It would be better if we could have a different function
        // for errors, as AJAX calls normally allow, but our version of XBlock
        // does not support status codes other than 200 for JSON encoded
        // responses.
        if (data['success']) {
            window.location.reload(false);
            return;
        }
        alert(data['errors'].join('\n'));
    };

    this.gather = function (scope, tracker, data, prefix, field) {
        var key = 'label';
        var name = scope.name.replace(prefix + '-', '');
        if (scope.name.indexOf('img-') == 0){
            name = name.replace('img-', '');
            key = 'img'
        }
        if (! (scope.name.indexOf(prefix + '-') >= 0)) {
            return
        }
        if (tracker.indexOf(name) == -1){
            tracker.push(name);
            data[field].push({'key': name})
        }
        var index = tracker.indexOf(name);
        console.log(data[field]);
        console.log(index);
        data[field][index][key] = scope.value;
        return true
    };

    this.pollSubmitHandler = function () {
        // Take all of the fields, serialize them, and pass them to the
        // server for saving.
        var handlerUrl = runtime.handlerUrl(element, 'studio_submit');
        var data = {};
        var tracker;
        var gatherings = self.mappings[pollType]['gather'];
        for (var gathering in gatherings) {
            tracker = [];
            var field = gatherings[gathering]['field'];
            var prefix = gatherings[gathering]['prefix'];
            data[field] = [];
            $('#poll-form input', element).each(function () {
                self.gather(this, tracker, data, prefix, field)
            });
        }
        data['display_name'] = $('#poll-display-name', element).val();
        data['question'] = $('#poll-question-editor', element).val();
        data['feedback'] = $('#poll-feedback-editor', element).val();

        $.ajax({
            type: "POST",
            url: handlerUrl,
            data: JSON.stringify(data),
            success: self.check_return
        });
    };

    self.init();
}

function PollEdit(runtime, element) {
    new PollEditUtil(runtime, element, 'poll');
}

function SurveyEdit(runtime, element) {
    new PollEditUtil(runtime, element, 'survey');
}
