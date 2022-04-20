import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'
import { FirelensLogRouterType, NetworkMode } from 'aws-cdk-lib/aws-ecs'

export class Ec2EcsSignalCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'ec2-signal-sample-vpc', {
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        }
      ]
    })
    const cluster = new ecs.Cluster(this, 'ec2-signal-sample-ecs', {
      vpc,
      clusterName: "ec2-signal-sample-ecs"
    })

    cluster.addCapacity('DefaultAutoScalingGroupCapacity', {
      instanceType: new ec2.InstanceType("t3.xlarge"),
      desiredCapacity: 1,
      keyName: 'springmt-test',
      associatePublicIpAddress: true,
      vpcSubnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }),
    })

    const executionRole = new iam.Role(this, 'Ec2SignalSampleEcsTaskExecutionRole', {
      roleName: 'ec2-signal-sample-ecs-task-execution-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    })
    const serviceTaskRole = new iam.Role(this, 'Ec2SignalSampleEcsServiceTaskRole', {
      roleName: 'ec2-signal-sample-ecs-service-task-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    })
    
    serviceTaskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: [
        'ssmmessages:CreateControlChannel',
        'ssmmessages:CreateDataChannel',
        'ssmmessages:OpenControlChannel',
        'ssmmessages:OpenDataChannel',
      ],
      resources: ['*'],
    }))

    const ec2TaskDef = new ecs.Ec2TaskDefinition(this, "Ec2SignalSampleEc2TaskDefinition", {
      executionRole: executionRole,
      taskRole: serviceTaskRole,
      networkMode: NetworkMode.AWS_VPC
    })

    const logGroup = new logs.LogGroup(this, 'Ec2SignalSampleLogGroup', {
      logGroupName: '/ecs/ec2-signal-sample-log',
      removalPolicy: RemovalPolicy.DESTROY // 今回は消す設定にする
    })

    const container = ec2TaskDef.addContainer('Ec2SignalSampleEc2ContainerDefinition',{
      image: ecs.ContainerImage.fromRegistry("springmt/signal_sample_server:v0.1.0"),
      cpu: 256,
      memoryLimitMiB: 256,
      stopTimeout: Duration.seconds(10),
      essential: true,
      logging: ecs.LogDrivers.firelens({
        options: {
          Name: 'cloudwatch',
          region: 'ap-northeast-1',
          log_group_name: logGroup.logGroupName,
          log_stream_prefix: "signal_sample_server",
        }
      }),
    })
    container.addContainerDependencies
    const service2 = new ecs.Ec2Service(this, 'Ec2SignalSampleService', {
      serviceName: "Ec2sSignalSampleEC2API",
      cluster,
      vpcSubnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }),
      taskDefinition: ec2TaskDef,
      desiredCount: 1,
      maxHealthyPercent: 200,
      minHealthyPercent: 50,
      enableExecuteCommand: true,
    })

  }

}
