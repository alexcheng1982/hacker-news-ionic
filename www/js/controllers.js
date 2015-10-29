angular.module('hackernews.controllers', ['firebase', 'ngCordova'])

.controller('AppCtrl', function($scope, $rootScope, $ionicModal, $ionicLoading, $ionicPopup, $firebaseObject, $cordovaInAppBrowser, $cordovaSocialSharing, APP_API) {
  var vm = this;

  vm.loginData = {};
  vm.signupData = {};

  $ionicModal.fromTemplateUrl('templates/login.html', {
    scope: $scope
  }).then(function(modal) {
    vm.loginModal = modal;
  });

  vm.login = function() {
    vm.loginModal.show();
  };

  vm.closeLogin = function() {
    vm.loginModal.hide();
  };

  vm.loginWithFacebook = function() {
    APP_API.authWithOAuthPopup('facebook', function(error, authData) {
      if (error) {
        if (error.code === 'TRANSPORT_UNAVAILABLE') {
          APP_API.authWithOAuthRedirect('facebook', function(error) {

          });
        }
      } else {
        vm.closeLogin();
      }
    });
  };

  $ionicModal.fromTemplateUrl('templates/signup.html', {
    scope: $scope
  }).then(function(modal) {
    vm.signupModal = modal;
  });

  vm.signup = function() {
    vm.signupModal.show();
  };

  vm.closeSignup = function() {
    vm.signupModal.hide();
  };

  vm.doLogin = function(loginData) {
    $ionicLoading.show({
      template: 'Logging in...'
    });
    APP_API.authWithPassword(loginData || {
      email: vm.loginData.email,
      password: vm.loginData.password
    }, function(error, authData) {
      $ionicLoading.hide();
      if (error) {
        $ionicPopup.alert({
          title: 'Log in failed',
          template: 'Failed to log in. Please check your email address and password.'
        });
      }
      else {
        vm.closeLogin();
      }
    });
  };

  vm.doSignup = function() {
    var signupData = {
      username: vm.signupData.username,
      email: vm.signupData.email,
      password: vm.signupData.password
    };

    $ionicLoading.show({
      template: 'Creating account...'
    });
    APP_API.createUser(signupData, function(error, authData) {
      $ionicLoading.hide();
      if (error) {
        $ionicPopup.alert({
          title: 'Sign up failed',
          template: error.message
        });
      } else {
        APP_API.child('users')
          .child(authData.uid)
          .set({
            name: signupData.username,
            email: signupData.email,
            favoriteStories: {}
          });
        vm.closeSignup();
        vm.closeLogin();
        vm.doLogin(signupData);
      }
    })
  };

  vm.logout = function() {
    APP_API.unauth();
  };

  $scope.viewLink = function(url) {
    $cordovaInAppBrowser.open(url, '_blank', {
      location: 'yes',
      clearcache: 'yes',
      toolbar: 'yes',
      toolbarposition: 'top'
    });
  };

  $scope.shareStory = function(story) {
    $cordovaSocialSharing.share(story.title, null, null, story.url);
  };

  APP_API.onAuth(function(authData) {
    if (authData) {
      var email = _.get(authData, [authData.provider, 'email'], '');
      $rootScope.userProfile = {
        uid: authData.uid,
        provider: authData.provider,
        email: email,
        profileImageUrl: _.get(authData, [authData.provider, 'profileImageURL'], '')
      };

      APP_API.child('users')
        .child(authData.uid)
        .once('value', function(snapshot) {
          var name = '';
          if (!snapshot.exists()) {
            name = _.get(authData, [authData.provider, 'displayName'], '');
            var user = {};
            user[authData.uid] = {
              email: email,
              name: name,
              favoriteStories: {}
            };
            snapshot.ref().parent().update(user, function() {
              $firebaseObject(snapshot.ref().child('favoriteStories')).$bindTo($rootScope, 'favoriteStories');
            });
          } else {
            var val = snapshot.val();
            name = val.name;
          }
          $rootScope.userProfile.name = name;
          $firebaseObject(snapshot.ref().child('favoriteStories')).$bindTo($rootScope, 'favoriteStories');
        });
    } else {
      $rootScope.userProfile = null;
    }
  });

  $scope.$on('$destroy', function() {
    vm.signupModal.remove();
    vm.loginModal.remove();
  });
})
.controller('TopStoriesCtrl', function($scope, $rootScope, $ionicNavBarDelegate, $timeout, ControllerStoreSupport, StoryStore, FavoritesSupport) {
  var vm = this;

  vm.storeSupport = ControllerStoreSupport.bind(
    $scope,
    _.bind(StoryStore.fetchStoriesByPage, StoryStore),
    vm,
    'stories'
  );

  FavoritesSupport.bind(vm, $rootScope);

  $scope.$on('$ionicView.afterEnter', function() {
    $timeout(function() {
      $ionicNavBarDelegate.title('Top Stories');
    });
  });
})
.controller('CommentsCtrl', function($scope, $stateParams, ControllerStoreSupport, CommentStore) {
  var vm = this;
  var itemId = $stateParams.itemId;

  vm.storeSupport = ControllerStoreSupport.bind(
    $scope,
    _.bind(CommentStore.fetchCommentsByPage, CommentStore, itemId),
    vm,
    'comments'
  );
})
.controller('FavoritesCtrl', function($scope, $rootScope, $timeout, $ionicNavBarDelegate, ControllerStoreSupport, FavoritesStore, FavoritesSupport) {
  var vm = this;

  vm.storeSupport = ControllerStoreSupport.bind(
    $scope,
    _.bind(FavoritesStore.fetchFavoritesByPage, FavoritesStore),
    vm,
    'stories'
  );

  FavoritesSupport.bind(vm, $rootScope);

  $scope.$on('$ionicView.afterEnter', function() {
    $timeout(function() {
      $ionicNavBarDelegate.title('Favorites');
    });
  });
});
