define(function (require_browser, exports, module) {
    var $ = require_browser('jquery'),
        _ = require_browser('underscore'),
        Marionette = require_browser('marionette'),
        App = require_browser('App'),
        moment = require_browser('moment'),
        filesize = require_browser('filesize'),

    // Models & Collections
        DirectoryExplorer = require_browser('models/DirectoryExplorer').DirectoryExplorer,
        DirectoryBreadcrumbs = require_browser('models/DirectoryExplorer').DirectoryBreadcrumbs,
        DirectoryContents = require_browser('collections/DirectoryContents').DirectoryContents,
        Server = require_browser('models/Server'),
        ServerConnection = require_browser('models/ServerConnection'),
    // Views
        ServerConnectionModal = require_browser('views/modal/ServerConnectionView'),
    // Templates
        fileManagerLayoutTpl = require_browser('text!views/filemanager/templates/filemanager-layout.html'),
        directoryExplorerTpl = require_browser('text!views/filemanager/templates/directory-explorer.html'),
        directoryItemTpl = require_browser('text!views/filemanager/templates/directory-item.html');

    var DirectoryBreadcrumbItemView = Marionette.ItemView.extend({
        template: _.template('<span class="crumb"></span>'),
        tagName: 'li',

        triggers: {
            'click .crumb': 'crumb:click'
        },

        bindings: {
            '.crumb': 'crumb'
        },

        onRender: function() {
            this.stickit();
        }
    });

    var DirectoryBreadcrumbView = module.exports.DirectoryBreadcrumbView = Marionette.CollectionView.extend({
        tagName: 'ol',
        className: 'breadcrumb',
        itemView: DirectoryBreadcrumbItemView,

        initialize: function(options) {
            this.on('itemview:crumb:click', _.bind(this.onCrumbClick, this));
        },

        onCrumbClick: function(itemView) {
            var pathCrumb = itemView.model.get('path');
            this.options.directoryExplorer.set('path', pathCrumb);
        }
    });

    var DirectoryItemView = module.exports.DirectoryItemView = Marionette.ItemView.extend({
        template: _.template(directoryItemTpl),
        tagName: 'tr',

        triggers: {
            'click .filename': 'filename:click'
        },

        bindings: {
            '.filename': 'filename',
            '.timestamp': {
                observe: 'mtime',
                onGet: function(val, options) {
                    return moment.unix(val).format('llll');
                }
            },
            '.size': {
                observe: 'size',
                onGet: function(val, options) {
                    return val ? filesize(val, true) : '';
                }
            },
            'i': {
                attributes: [{
                    name: 'class',
                    observe: 'mode',
                    onGet: function(val, options) {
                        return 'icon_mode M' + val;
                    }
                }]
            }
        },

        onRender: function() {
            this.stickit();
        }
    });

    var DirectoryExplorerView = module.exports.DirectoryExplorerView = Marionette.CompositeView.extend({
        template: _.template(directoryExplorerTpl),
        tagName: 'table',
        className: 'directory-explorer table-striped',
        itemView: DirectoryItemView,
        itemViewContainer: 'tbody',

        events: {
            'click th.column-filename': 'onSortByName',
            'click th.column-mtime': 'onSortByModified',
            'click th.column-size': 'onSortBySize'
        },

        collectionEvents: {
            'sort': 'render toggleSortCaret'
        },

        initialize: function(options) {
            this.listenTo(this, 'itemview:filename:click', this.onFilenameClick);
        },

        close: function() {
        },

        onFilenameClick: function(itemView) {
            var dirObject = itemView.model
            if(dirObject.get('mode') === 16877) {
                this.model.appendPath(dirObject.get('filename'));
            } else {
                this.trigger('filemanager:file:click', itemView.model, this.model.get('path'));
            }
        },

        onSortByModified: function() {
            var sortDirection = (this.collection.sortDirection === 'DSC') ? 'ASC': 'DSC';
            this.collection.sort({sortProperty: 'mtime', sortDirection: sortDirection});
        },

        onSortByName: function() {
            var sortDirection = (this.collection.sortDirection === 'DSC') ? 'ASC': 'DSC';
            this.collection.sort({sortProperty: 'filename', sortDirection: sortDirection});
        },

        onSortBySize: function() {
            var sortDirection = (this.collection.sortDirection === 'DSC') ? 'ASC': 'DSC';
            this.collection.sort({sortProperty: 'size', sortDirection: sortDirection});
        },

        toggleSortCaret: function() {
            var direction = (this.collection.sortDirection === 'ASC') ? 'up' : 'down';
            this.$('th.column-' + this.collection.sortProperty + ' i').hide();
            this.$('th.column-' + this.collection.sortProperty + ' i').attr('class', 'icon-caret-' + direction).show();
        }

    });

    module.exports.FileManagerLayout = Marionette.Layout.extend({
        template: _.template(fileManagerLayoutTpl),
        id: 'file-manager-layout',

        regions: {
            breadcrumbRegion: '#file-manager-breadcrumbs',
            explorerRegion: '#file-manager-explorer'
        },

        initialize: function(options) {
            if(typeof options.controllerTriggers === 'undefined') {
                throw 'controllerTriggers is a required option';
            }
            options.path = options.path ? options.path : '/';
            App.vent.on('server:selected', this.onServerSelected, this);
            App.vent.on('server:connected', this.transitionToShowFileManager, this);
        },

        close: function() {
            App.vent.off('server:selected', this.onServerSelected);
            App.vent.off('server:connected', this.transitionToShowFileManager);
        },

        onFileClick: function(fileModel, path) {
            var filePath = path + fileModel.get('filename');
            this.options.controllerTriggers.execute('navigate', 'editor', {file: fileModel.get('filename'), path: path});
        },

        onRender: function() {
            var activeServer = App.getActiveServer();
            if(activeServer) {
                this.showFileManager(activeServer);
            }
        },

        onServerSelected: function(server) {
            var serverConnection = new ServerConnection({}, {server: server});
            App.showModal(new ServerConnectionModal({model: serverConnection}));
            serverConnection.connect();
        },

        showFileManager: function(server) {
            var directoryExplorer = new DirectoryExplorer({path: this.options.path});
            var directoryContents = new DirectoryContents([], {directoryExplorer: directoryExplorer, server: server});
            var directoryBreadcrumbs = new DirectoryBreadcrumbs([], {directoryExplorer: directoryExplorer});

            var directoryExplorerView = new DirectoryExplorerView({model: directoryExplorer, collection: directoryContents});
            this.listenTo(directoryExplorerView, 'filemanager:file:click', this.onFileClick);

            var directoryBreadcrumbView = new DirectoryBreadcrumbView({collection: directoryBreadcrumbs, directoryExplorer: directoryExplorer});

            this.explorerRegion.show(directoryExplorerView);
            this.breadcrumbRegion.show(directoryBreadcrumbView);
            directoryContents.fetch();
            directoryBreadcrumbs.fetch();
        },

        transitionToShowFileManager: function(server) {
            this.showFileManager(server);
            _.delay(_.bind(App.closeModal, App), 1200);
        }
    });
});
