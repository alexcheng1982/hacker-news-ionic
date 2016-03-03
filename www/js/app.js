angular.module('hackernews', ['ionic', 'hackernews.controllers'])

.run(function($ionicPlatform) {
  $ionicPlatform.ready(function() {
    // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
    // for form inputs)
    if (window.cordova && window.cordova.plugins.Keyboard) {
      cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
    }
    if (window.StatusBar) {
      // org.apache.cordova.statusbar required
      StatusBar.styleDefault();
    }
    if (window.codePush) {
      window.codePush.sync();
    }
  });
})
.config(function($stateProvider, $urlRouterProvider) {
  $stateProvider.state('app', {
    url: "/app",
    abstract: true,
    templateUrl: "templates/menu.html",
    controller: 'AppCtrl as vm'
  })
  .state('app.topstories', {
    url: "/topstories",
    views: {
      'menuContent': {
        templateUrl: "templates/topstories.html",
        controller: 'TopStoriesCtrl as vm'
      }
    }
  })
  .state('app.comments', {
    url: '/comments/:itemId',
    views: {
      'menuContent': {
        templateUrl: 'templates/comments.html',
        controller: 'CommentsCtrl as vm'
      }
    }
  })
  .state('app.favorites', {
    url: '/favorites',
    views: {
      'menuContent': {
        templateUrl: 'templates/topstories.html',
        controller: 'FavoritesCtrl as vm'
      }
    }
  });

  $urlRouterProvider.otherwise('/app/topstories');
})
.filter('timeAgo', function() {
  return function(timestamp) {
    return _.isNaN(timestamp) ? '' :  moment(timestamp).fromNow();
  };
})
.constant('HN_API_ENDPOINT', 'https://hacker-news.firebaseio.com/v0')
.constant('APP_API_ENDPOINT', 'https://ionic-hacker-news.firebaseio.com/')
.factory('HN_API', function(HN_API_ENDPOINT) {
  return new Firebase(HN_API_ENDPOINT);
})
.factory('APP_API', function(APP_API_ENDPOINT) {
  return new Firebase(APP_API_ENDPOINT);
})
.factory('ItemStore', function(HN_API, $q) {
  var cachedItems = {};

  function fetchItem(id) {
    return $q(function(resolve, reject) {
      if (cachedItems[id]) {
        resolve(cachedItems[id]);
      } else {
        HN_API.child('item/' + id).on('value', function(snapshot) {
          var item = snapshot.val();
          cachedItems[id] = item;
          resolve(item);
        }, function(error) {
          reject(error);
        });
      }
    });
  }

  function fetchItems(ids) {
    return $q.all(_.map(ids, fetchItem));
  }

  return {
    fetchItems: fetchItems,
    fetchItem: fetchItem
  };
})
.factory('StoryStore', function(HN_API, ItemStore, $q) {
  var cachedStoryIds = [];
  var storiesPerPage = 10;

  var initalLoading = $q.defer();
  HN_API.child('topstories').on('value', function(snapshot) {
    cachedStoryIds = snapshot.val();
    initalLoading.resolve(true);
  });

  function fetchStory(id) {
    return ItemStore.fetchItem(id);
  }

  function fetchStoriesByPage(page) {
    return initalLoading.promise.then(function() {
      var start = (page - 1) * storiesPerPage,
        end = page * storiesPerPage,
        ids = cachedStoryIds.slice(start, end);
      return ItemStore.fetchItems(ids);
    });
  }

  return {
    fetchStoriesByPage: fetchStoriesByPage,
    fetchStory: fetchStory
  };
})
.factory('CommentStore', function(ItemStore) {
  var commentsPerPage = 10;

  function fetchCommentsByPage(itemId, page) {
    return ItemStore.fetchItem(itemId).then(function(item) {
      var start = (page - 1) * commentsPerPage,
        end = page * commentsPerPage,
        ids = item.kids.slice(start, end);
      return ItemStore.fetchItems(ids);
    });
  }

  return {
    fetchCommentsByPage: fetchCommentsByPage
  };
})
.factory('FavoritesStore', function(APP_API, ItemStore, $rootScope, $q) {
  var storiesPerPage = 10;

  function fetchFavoritesByPage(page) {
    return $q(function(resolve, reject) {
      if ($rootScope.userProfile) {
        APP_API.child('users')
          .child($rootScope.userProfile.uid)
          .child('favoriteStories')
          .once('value', function(snapshot) {
            var stories = snapshot.val(),
              start = (page - 1) * storiesPerPage,
              end = page * storiesPerPage,
              favorites = _.keys(stories);
            favorites.reverse();
            var ids = favorites.slice(start, end);
            resolve(ItemStore.fetchItems(ids));
          });
      } else {
        resolve([]);
      }
    });
  }

  return {
    fetchFavoritesByPage: fetchFavoritesByPage
  };
})
.factory('ControllerStoreSupport', function() {
  return {
    bind: function($scope, fetchFunc, ctrlRef, itemsProperty) {
      return new function() {
        var currentPage = 1;
        var pageSize = 10;
        var loadedItemsCount = -1;

        this.refresh = function() {
          fetchFunc(1).then(function(items) {
            _.set(ctrlRef, itemsProperty, items);
            loadedItemsCount = items.length;
            return items;
          })['finally'](function() {
            $scope.$broadcast('scroll.refreshComplete');
          });
        };

        this.hasMoreItemsToLoad = function() {
          return loadedItemsCount === -1 || loadedItemsCount >= pageSize;
        };

        this.loadMoreItems = function() {
          if (!this.hasMoreItemsToLoad()) {
            $scope.$broadcast('scroll.infiniteScrollComplete');
            return;
          }
          fetchFunc(currentPage).then(function(items) {
            var existingItems = _.get(ctrlRef, itemsProperty, []);
            _.set(ctrlRef, itemsProperty, existingItems.concat(items));
            loadedItemsCount = items.length;
            currentPage++;
            return items;
          }, function() {
            loadedItemsCount = -1;
          })['finally'](function() {
            $scope.$broadcast('scroll.infiniteScrollComplete');
          });
        };
      };
    }
  };
})
.factory('FavoritesSupport', function() {
  return {
    bind: function($scope, $rootScope) {
      $scope.isFavored = function(story) {
        if ($rootScope.favoriteStories) {
          return !!$rootScope.favoriteStories[story.id];
        }
        return false;
      };

      $scope.addToFavorite = function(story) {
        if ($rootScope.favoriteStories) {
          $rootScope.favoriteStories[story.id] = {
            timestamp: Firebase.ServerValue.TIMESTAMP
          };
        }
      };

      $scope.removeFromFavorite = function(story) {
        if ($rootScope.favoriteStories) {
          delete $rootScope.favoriteStories[story.id];
        }
      };
    }
  };
});
