package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

type listActiveUserSubRepoStub struct {
	userSubRepoNoop
	subs []UserSubscription
}

func (s listActiveUserSubRepoStub) ListActiveByUserID(context.Context, int64) ([]UserSubscription, error) {
	return s.subs, nil
}

func TestAPIKeyService_ResolveImplicitGroupID_UsesSingleActiveSubscriptionGroup(t *testing.T) {
	svc := &APIKeyService{
		userSubRepo: listActiveUserSubRepoStub{
			subs: []UserSubscription{
				{GroupID: 4},
			},
		},
	}

	groupID, err := svc.resolveImplicitGroupID(context.Background(), 123, CreateAPIKeyRequest{})
	require.NoError(t, err)
	require.NotNil(t, groupID)
	require.Equal(t, int64(4), *groupID)
}

func TestAPIKeyService_ResolveImplicitGroupID_ReturnsNilWhenMultipleSubscriptionGroups(t *testing.T) {
	svc := &APIKeyService{
		userSubRepo: listActiveUserSubRepoStub{
			subs: []UserSubscription{
				{GroupID: 4},
				{GroupID: 5},
			},
		},
	}

	groupID, err := svc.resolveImplicitGroupID(context.Background(), 123, CreateAPIKeyRequest{})
	require.NoError(t, err)
	require.Nil(t, groupID)
}

func TestAPIKeyService_ResolveImplicitGroupID_PreservesExplicitGroupID(t *testing.T) {
	explicit := int64(9)
	svc := &APIKeyService{
		userSubRepo: listActiveUserSubRepoStub{
			subs: []UserSubscription{{GroupID: 4}},
		},
	}

	groupID, err := svc.resolveImplicitGroupID(context.Background(), 123, CreateAPIKeyRequest{GroupID: &explicit})
	require.NoError(t, err)
	require.NotNil(t, groupID)
	require.Equal(t, explicit, *groupID)
}
